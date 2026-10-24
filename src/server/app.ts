import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { storage } from '../db/storage';
import { CalendarSyncService } from '../calendar/syncService';
import { ReminderEngine } from '../calendar/reminderEngine';

export function createServer(reminderEngine: ReminderEngine) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // App public config
  app.get('/api/config', (_req: Request, res: Response) => {
    res.json({ clientId: config.clientId });
  });

  // Export database backup for hosting persistence
  app.get('/api/backup', (_req: Request, res: Response) => {
    res.json(storage.getBackup());
  });

  // Discord Activity OAuth2 token exchange
  app.post('/api/token', async (req: Request, res: Response) => {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Missing code parameter' });
    }

    try {
      const response = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: 'authorization_code',
          code: code
        })
      });

      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json(data);
      }

      // Fetch user profile from Discord using the new access_token
      let user = null;
      try {
        const userRes = await fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${data.access_token}` }
        });
        if (userRes.ok) {
          user = await userRes.json();
        }
      } catch (uErr) {
        console.error('Failed to fetch user with access_token:', uErr);
      }

      res.json({ ...data, user });
    } catch (err: any) {
      console.error('OAuth token exchange error:', err);
      res.status(500).json({ error: 'Token exchange failed' });
    }
  });

  function resolveUserId(rawUserId: string): string | null {
    if (rawUserId && rawUserId !== 'demo-user' && rawUserId !== 'undefined' && rawUserId !== 'null') {
      return rawUserId.trim();
    }
    return null;
  }

  // Get user calendar status and upcoming events
  app.get('/api/user/:userId/calendar', async (req: Request, res: Response) => {
    const userId = resolveUserId(String(req.params.userId));
    if (!userId) {
      return res.json({
        linked: false,
        reminderMinutes: 10,
        calendars: [],
        events: []
      });
    }

    let user = storage.getUser(userId);

    if (!user) {
      return res.json({
        linked: false,
        reminderMinutes: 10,
        calendars: [],
        events: []
      });
    }

    try {
      const events = await reminderEngine.getUserEvents(user);
      return res.json({
        linked: user.calendars.length > 0 || Boolean(user.icalUrl),
        reminderMinutes: user.reminderMinutes,
        enabled: user.enabled,
        userId: user.userId,
        calendars: user.calendars || [],
        events: events.map(e => ({
          id: e.id,
          title: e.title,
          description: e.description,
          location: e.location,
          start: e.start.toISOString(),
          end: e.end.toISOString(),
          isAllDay: e.isAllDay,
          calendarName: e.calendarName
        }))
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Link calendar via iCal URL
  app.post('/api/user/:userId/calendar', async (req: Request, res: Response) => {
    const userId = resolveUserId(String(req.params.userId));
    if (!userId) {
      return res.status(400).json({ error: 'A valid Discord user ID is required to link calendars.' });
    }
    const { icalUrl, name, reminderMinutes } = req.body;

    if (!icalUrl || typeof icalUrl !== 'string') {
      return res.status(400).json({ error: 'A valid icalUrl is required.' });
    }

    const cleanUrl = CalendarSyncService.sanitizeUrl(icalUrl);
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      return res.status(400).json({ error: 'URL must start with http://, https://, or webcal://' });
    }

    try {
      // Validate by fetching events
      const events = await CalendarSyncService.fetchUpcomingEvents(cleanUrl, 7);

      const existing = storage.getUser(userId);
      const defaultName = name || (existing && existing.calendars.length > 0 ? `Calendar ${existing.calendars.length + 1}` : 'Primary');

      const linked = storage.addCalendar(
        userId,
        defaultName,
        cleanUrl,
        reminderMinutes ?? existing?.reminderMinutes ?? 10
      );

      reminderEngine.invalidateUserCache(userId);

      const updatedUser = storage.getUser(userId)!;

      res.json({
        success: true,
        calendar: linked,
        totalCalendars: updatedUser.calendars.length,
        eventCount: events.length,
        reminderMinutes: updatedUser.reminderMinutes
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Could not validate calendar URL' });
    }
  });

  // Unlink calendar
  app.delete('/api/user/:userId/calendar', (req: Request, res: Response) => {
    const userId = resolveUserId(String(req.params.userId));
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const calendarId = req.query.calendarId ? String(req.query.calendarId) : undefined;

    let removed = false;
    if (calendarId) {
      removed = storage.removeCalendar(userId, calendarId);
    } else {
      removed = storage.deleteUser(userId);
    }

    reminderEngine.invalidateUserCache(userId);
    res.json({ success: removed });
  });

  // Update reminder settings
  app.patch('/api/user/:userId/settings', (req: Request, res: Response) => {
    const userId = resolveUserId(String(req.params.userId));
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const { reminderMinutes, enabled, timezone, dailyDigestEnabled, dailyDigestTime } = req.body;
    const user = storage.getUser(userId);

    if (!user) {
      return res.status(404).json({ error: 'User calendar not found' });
    }

    if (reminderMinutes !== undefined) {
      user.reminderMinutes = Number(reminderMinutes);
    }
    if (enabled !== undefined) {
      user.enabled = Boolean(enabled);
    }
    if (timezone !== undefined && typeof timezone === 'string') {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
        user.timezone = timezone;
      } catch {
        return res.status(400).json({ error: 'Invalid IANA timezone' });
      }
    }
    if (dailyDigestEnabled !== undefined) {
      user.dailyDigestEnabled = Boolean(dailyDigestEnabled);
    }
    if (dailyDigestTime !== undefined && typeof dailyDigestTime === 'string') {
      if (/^([01]?\d|2[0-3]):([0-5]\d)$/.test(dailyDigestTime)) {
        user.dailyDigestTime = dailyDigestTime;
      } else {
        return res.status(400).json({ error: 'dailyDigestTime must be in HH:mm 24-hour format' });
      }
    }
    user.updatedAt = new Date().toISOString();

    storage.saveUser(user);
    res.json({ success: true, user });
  });

  // Send a test reminder DM
  app.post('/api/user/:userId/test', async (req: Request, res: Response) => {
    const userId = resolveUserId(String(req.params.userId));
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const testEvent = {
      id: `test_${Date.now()}`,
      title: '🎉 Google Calendar Reminder Test',
      description: 'Your Discord calendar alerts are working properly!',
      location: 'Discord Activity Dashboard',
      start: new Date(Date.now() + 10 * 60 * 1000),
      end: new Date(Date.now() + 40 * 60 * 1000),
      isAllDay: false
    };

    const success = await reminderEngine.sendReminder(userId, testEvent, 10);
    res.json({ success });
  });

  // Serve static files from public directory
  const publicDir = path.resolve(process.cwd(), 'public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  // Fallback to index.html for single-page app
  app.use((_req: Request, res: Response) => {
    const indexPath = path.resolve(publicDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.send('<h1>Google Calendar Discord Bot & Activity</h1><p>Server is running!</p>');
    }
  });

  return app;
}
