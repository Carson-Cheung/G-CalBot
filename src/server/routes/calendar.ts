import { Router, Request, Response } from 'express';
import { config } from '../../config';
import { storage } from '../../db/storage';
import { CalendarSyncService } from '../../calendar/syncService';
import { ReminderEngine } from '../../calendar/reminderEngine';
import { isValidTimezone, isValid24HourTime } from '../../utils/time';
import { activityLogger } from '../../utils/activityLogger';
import { verifySessionToken } from '../../utils/session';

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.trim()) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : authHeader.trim();
  }
  return null;
}

export function resolveAuthorizedUserId(req: Request): { userId: string; unauthorized: boolean } {
  const token = extractBearerToken(req);
  const verified = verifySessionToken(token);
  let requestedId = String(req.params.userId || 'demo-user').trim();
  if (!requestedId || requestedId === 'undefined' || requestedId === 'null') {
    requestedId = 'demo-user';
  }

  if (requestedId === 'demo-user' || requestedId === 'me') {
    if (requestedId === 'me' && verified) {
      return { userId: verified.userId, unauthorized: false };
    }
    return { userId: 'demo-user', unauthorized: false };
  }

  // requestedId is a real user ID (not 'demo-user')
  if (!verified || verified.userId !== requestedId) {
    return { userId: 'demo-user', unauthorized: true };
  }

  return { userId: verified.userId, unauthorized: false };
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

  // Export database backup (restricted to authenticated bot owner only)
  router.get('/backup', async (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    const verified = verifySessionToken(token);
    const ownerId = (await reminderEngine?.getOwnerUserId()) || config.ownerUserId;
    if (!verified || !ownerId || verified.userId !== ownerId) {
      return res.status(401).json({
        error: 'Unauthorized: Database backup endpoint is restricted to the bot owner.',
      });
    }
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
    const { userId, unauthorized } = resolveAuthorizedUserId(req);
    if (unauthorized) {
      return res.status(401).json({
        error: 'Unauthorized: Please sign in through Discord or run /dash in Discord to access your personal calendar.',
      });
    }

    const user = storage.getUser(userId);

    if (!user) {
      return res.json({
        linked: false,
        reminderMinutes: 10,
        enabled: true,
        timezone: 'America/New_York',
        dailyDigestEnabled: false,
        dailyDigestTime: '08:00',
        calendars: [],
        events: [],
      });
    }

    try {
      const isManualSync = req.query.sync === 'true';
      if (isManualSync) {
        reminderEngine?.invalidateUserCache(userId);
        activityLogger.log(
          'system',
          '🔄',
          userId === 'demo-user'
            ? 'Manual calendar sync triggered on Demo Showcase'
            : 'Manual calendar sync triggered from Activity dashboard'
        );
      }

      const events = reminderEngine ? await reminderEngine.getUserEvents(user, isManualSync) : [];
      return res.json({
        linked: user.calendars.length > 0 || Boolean(user.icalUrl),
        reminderMinutes: user.reminderMinutes,
        enabled: user.enabled,
        userId: user.userId,
        timezone: user.timezone || 'America/New_York',
        dailyDigestEnabled: Boolean(user.dailyDigestEnabled),
        dailyDigestTime: user.dailyDigestTime || '08:00',
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
    const { userId, unauthorized } = resolveAuthorizedUserId(req);
    if (unauthorized) {
      return res.status(401).json({
        error: 'Unauthorized: Please sign in through Discord or run /dash in Discord to access your personal calendar.',
      });
    }
    if (userId === 'demo-user') {
      return res.status(403).json({
        error: 'Demo mode is read-only. Run /dash in Discord or launch the Activity to manage your own calendar!',
      });
    }

    const { icalUrl, name, reminderMinutes } = req.body;

    if (!icalUrl || typeof icalUrl !== 'string') {
      return res.status(400).json({ error: 'A valid icalUrl is required.' });
    }

    const cleanUrl = CalendarSyncService.sanitizeUrl(icalUrl);
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      return res.status(400).json({
        error:
          'Invalid calendar URL or ID. Please provide your Google Calendar Secret iCal URL, Public Embed link, or Calendar ID.',
      });
    }

    try {
      // Validate by fetching events
      const events = await CalendarSyncService.fetchUpcomingEvents(cleanUrl, 7);

      const existing = storage.getUser(userId);
      const rawName =
        name ||
        (existing && existing.calendars.length > 0
          ? `Calendar ${existing.calendars.length + 1}`
          : 'Primary');
      const defaultName = String(rawName).trim().slice(0, 50);

      const linked = storage.addCalendar(
        userId,
        defaultName,
        cleanUrl,
        reminderMinutes ?? existing?.reminderMinutes ?? 10
      );

      reminderEngine?.invalidateUserCache(userId);

      activityLogger.log(
        'system',
        '📅',
        `Connected calendar feed "${defaultName}" via Activity dashboard (${events.length} events)`
      );

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
    const { userId, unauthorized } = resolveAuthorizedUserId(req);
    if (unauthorized) {
      return res.status(401).json({
        error: 'Unauthorized: Please sign in through Discord or run /dash in Discord to access your personal calendar.',
      });
    }
    if (userId === 'demo-user') {
      return res.status(403).json({
        error: 'Demo mode is read-only. Run /dash in Discord or launch the Activity to manage your own calendar!',
      });
    }

    const rawCalId = req.params.calId;
    const calIdParam = Array.isArray(rawCalId) ? rawCalId[0] : rawCalId;
    const calendarId = calIdParam || (req.query.calendarId ? String(req.query.calendarId) : undefined);

    let removed = false;
    if (calendarId) {
      removed = storage.removeCalendar(userId, calendarId);
    } else {
      removed = storage.removeCalendar(userId, 'all');
    }

    reminderEngine?.invalidateUserCache(userId);
    if (removed) {
      activityLogger.log(
        'system',
        '🗑️',
        calendarId
          ? 'Removed a connected calendar feed via Activity dashboard'
          : 'Unlinked all calendar feeds via Activity dashboard'
      );
    }
    res.json({ success: removed });
  };

  router.delete('/user/:userId/calendar/:calId', handleUnlink);
  router.delete('/user/:userId/calendar', handleUnlink);

  // Update reminder settings
  router.patch('/user/:userId/settings', (req: Request, res: Response) => {
    const { userId, unauthorized } = resolveAuthorizedUserId(req);
    if (unauthorized) {
      return res.status(401).json({
        error: 'Unauthorized: Please sign in through Discord or run /dash in Discord to access your personal calendar.',
      });
    }
    if (userId === 'demo-user') {
      return res.status(403).json({
        error: 'Demo mode is read-only. Run /dash in Discord or launch the Activity to manage your own calendar!',
      });
    }

    const { reminderMinutes, enabled, timezone, dailyDigestEnabled, dailyDigestTime } = req.body;
    let user = storage.getUser(userId);

    if (!user) {
      const now = new Date().toISOString();
      user = {
        userId,
        calendars: [],
        reminderMinutes: 10,
        enabled: true,
        timezone: 'America/New_York',
        dailyDigestEnabled: false,
        dailyDigestTime: '08:00',
        createdAt: now,
        updatedAt: now,
      };
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
        const [hh, mm] = dailyDigestTime.trim().split(':');
        user.dailyDigestTime = `${hh.padStart(2, '0')}:${mm}`;
      } else {
        return res.status(400).json({ error: 'dailyDigestTime must be in HH:mm 24-hour format' });
      }
    }
    user.updatedAt = new Date().toISOString();

    storage.saveUser(user);
    activityLogger.log(
      'system',
      '⚙️',
      `Updated alert preferences via Activity dashboard (${user.reminderMinutes}m prior, TZ: ${user.timezone || 'America/New_York'})`
    );
    res.json({ success: true, user });
  });

  // In-memory rate limiting map for test DM alerts to prevent abuse/spam
  const testDmCooldowns = new Map<string, number>();
  const DEMO_TEST_COOLDOWN_MS = 60 * 1000; // 60s cooldown for demo visitors
  const USER_TEST_COOLDOWN_MS = 15 * 1000; // 15s cooldown for authenticated users

  // Send a test reminder DM
  router.post('/user/:userId/test', async (req: Request, res: Response) => {
    const { userId, unauthorized } = resolveAuthorizedUserId(req);
    if (unauthorized) {
      return res.status(401).json({
        error: 'Unauthorized: Please sign in through Discord or run /dash in Discord to access your personal calendar.',
      });
    }

    const isDemo = userId === 'demo-user';
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const cooldownKey = isDemo ? `demo:${clientIp}` : `user:${userId}`;
    const now = Date.now();
    const lastSent = testDmCooldowns.get(cooldownKey) || 0;
    const cooldownLimit = isDemo ? DEMO_TEST_COOLDOWN_MS : USER_TEST_COOLDOWN_MS;

    if (now - lastSent < cooldownLimit) {
      const remainingSec = Math.ceil((cooldownLimit - (now - lastSent)) / 1000);
      return res.status(429).json({
        error: `Please wait ${remainingSec}s before sending another test DM alert.`,
      });
    }
    testDmCooldowns.set(cooldownKey, now);

    // Prune stale cooldown entries if map grows
    if (testDmCooldowns.size > 500) {
      for (const [key, ts] of testDmCooldowns.entries()) {
        if (now - ts > DEMO_TEST_COOLDOWN_MS * 2) {
          testDmCooldowns.delete(key);
        }
      }
    }

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

    if (isDemo) {
      activityLogger.log(
        'reminder',
        '🧪',
        'Demo Showcase visitor triggered a Test DM alert to bot owner! ;)'
      );
    } else {
      activityLogger.log(
        'reminder',
        '🔔',
        'Triggered manual Test DM alert from Activity dashboard'
      );
    }

    const success = reminderEngine
      ? await reminderEngine.sendReminder(targetDiscordUserId, testEvent, 10)
      : false;
    res.json({ success, isDemo });
  });

  return router;
}

export default createCalendarRouter;
