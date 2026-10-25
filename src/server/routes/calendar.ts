import { Router, Request, Response } from 'express';
import { config } from '../../config';
import { storage } from '../../db/storage';
import { CalendarSyncService } from '../../calendar/syncService';
import { ReminderEngine } from '../../calendar/reminderEngine';
import { isValidTimezone, isValid24HourTime } from '../../utils/time';
import { activityLogger } from '../../utils/activityLogger';

function resolveUserId(rawUserId: string): string {
  if (rawUserId && rawUserId !== 'undefined' && rawUserId !== 'null') {
    return rawUserId.trim();
  }
  return 'demo-user';
}

export function createCalendarRouter(reminderEngine?: ReminderEngine): Router {
  const router = Router();

  // Health check
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      storage: storage.isPostgresConnected() ? 'neon-postgresql' : 'local-json',
    });
  });

  // Export database backup for hosting persistence
  router.get('/backup', (_req: Request, res: Response) => {
    res.json(storage.getBackup());
  });

  // Expose recent activity and command logs (privacy-safe in-memory ring buffer)
  router.get('/logs', (req: Request, res: Response) => {
    const orderParam = typeof req.query.order === 'string' ? req.query.order.toLowerCase() : '';
    const order = orderParam === 'desc' || orderParam === 'newest' ? 'desc' : 'asc';
    const logs = activityLogger.getLogs(order);
    res.json({
      status: 'ok',
      count: logs.length,
      logs,
    });
  });

  // Get user calendar status and upcoming events
  router.get('/user/:userId/calendar', async (req: Request, res: Response) => {
    const userId = resolveUserId(String(req.params.userId));
    if (!userId) {
      return res.json({
        linked: false,
        reminderMinutes: 10,
        calendars: [],
        events: [],
      });
    }

    const user = storage.getUser(userId);

    if (!user) {
      return res.json({
        linked: false,
        reminderMinutes: 10,
        calendars: [],
        events: [],
      });
    }

    try {
      const events = reminderEngine ? await reminderEngine.getUserEvents(user) : [];
      return res.json({
        linked: user.calendars.length > 0 || Boolean(user.icalUrl),
        reminderMinutes: user.reminderMinutes,
        enabled: user.enabled,
        userId: user.userId,
        calendars: user.calendars || [],
        events: events.map((e) => ({
          id: e.id,
          title: e.title,
          description: e.description,
          location: e.location,
          start: e.start.toISOString(),
          end: e.end.toISOString(),
          isAllDay: e.isAllDay,
          calendarName: e.calendarName,
        })),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Link calendar via iCal URL
  router.post('/user/:userId/calendar', async (req: Request, res: Response) => {
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
      const defaultName =
        name ||
        (existing && existing.calendars.length > 0
          ? `Calendar ${existing.calendars.length + 1}`
          : 'Primary');

      const linked = storage.addCalendar(
        userId,
        defaultName,
        cleanUrl,
        reminderMinutes ?? existing?.reminderMinutes ?? 10
      );

      reminderEngine?.invalidateUserCache(userId);

      const updatedUser = storage.getUser(userId)!;

      res.json({
        success: true,
        calendar: linked,
        totalCalendars: updatedUser.calendars.length,
        eventCount: events.length,
        reminderMinutes: updatedUser.reminderMinutes,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Could not validate calendar URL' });
    }
  });

  // Unlink calendar handler supporting both :calId param and ?calendarId query
  const handleUnlink = (req: Request, res: Response) => {
    const userId = resolveUserId(String(req.params.userId));
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const rawCalId = req.params.calId;
    const calIdParam = Array.isArray(rawCalId) ? rawCalId[0] : rawCalId;
    const calendarId = calIdParam || (req.query.calendarId ? String(req.query.calendarId) : undefined);

    let removed = false;
    if (calendarId) {
      removed = storage.removeCalendar(userId, calendarId);
    } else {
      removed = storage.deleteUser(userId);
    }

    reminderEngine?.invalidateUserCache(userId);
    res.json({ success: removed });
  };

  router.delete('/user/:userId/calendar/:calId', handleUnlink);
  router.delete('/user/:userId/calendar', handleUnlink);

  // Update reminder settings
  router.patch('/user/:userId/settings', (req: Request, res: Response) => {
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
      if (isValidTimezone(timezone)) {
        user.timezone = timezone.trim();
      } else {
        return res.status(400).json({ error: 'Invalid IANA timezone' });
      }
    }
    if (dailyDigestEnabled !== undefined) {
      user.dailyDigestEnabled = Boolean(dailyDigestEnabled);
    }
    if (dailyDigestTime !== undefined && typeof dailyDigestTime === 'string') {
      if (isValid24HourTime(dailyDigestTime)) {
        user.dailyDigestTime = dailyDigestTime.trim();
      } else {
        return res.status(400).json({ error: 'dailyDigestTime must be in HH:mm 24-hour format' });
      }
    }
    user.updatedAt = new Date().toISOString();

    storage.saveUser(user);
    res.json({ success: true, user });
  });

  // Send a test reminder DM
  router.post('/user/:userId/test', async (req: Request, res: Response) => {
    const userId = resolveUserId(String(req.params.userId));
    const isDemo = userId === 'demo-user';
    const targetDiscordUserId = isDemo
      ? (await reminderEngine?.getOwnerUserId()) || config.ownerUserId
      : userId;

    if (!targetDiscordUserId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const testEvent = isDemo
      ? {
          id: `demo_test_${Date.now()}`,
          title: '🧪 Demo User Test Button Clicked!',
          description:
            'Someone just clicked the "🔔 Test DM" button on the public demo-user dashboard!',
          location: 'G-CalBot Public Demo (demo-user)',
          start: new Date(Date.now() + 10 * 60 * 1000),
          end: new Date(Date.now() + 40 * 60 * 1000),
          isAllDay: false,
          calendarName: 'Demo Dashboard',
        }
      : {
          id: `test_${Date.now()}`,
          title: '🎉 Google Calendar Reminder Test',
          description: 'Your Discord calendar alerts are working properly!',
          location: 'Discord Activity Dashboard',
          start: new Date(Date.now() + 10 * 60 * 1000),
          end: new Date(Date.now() + 40 * 60 * 1000),
          isAllDay: false,
        };

    const success = reminderEngine
      ? await reminderEngine.sendReminder(targetDiscordUserId, testEvent, 10)
      : false;
    res.json({ success, isDemo });
  });

  return router;
}

export default createCalendarRouter;
