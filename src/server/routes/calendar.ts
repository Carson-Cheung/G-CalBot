import { Router, Request, Response } from 'express';
import { config, MAX_CALENDARS_PER_USER, MAX_REMINDER_MINUTES } from '../../config';
import { storage } from '../../db/storage';
import { CalendarSyncService } from '../../calendar/syncService';
import { ReminderEngine } from '../../calendar/reminderEngine';
import { CalendarEvent, UserCalendarConfig } from '../../types';
import { isValidTimezone, isValid24HourTime } from '../../utils/time';
import { activityLogger, censorUsername } from '../../utils/activityLogger';
import { FixedWindowLimiter, clientIp } from '../rateLimit';
import { authorizeUser, getAuthorized } from '../requestAuth';

export { resolveAuthorizedUserId } from '../requestAuth';

const DEFAULT_TIMEZONE = 'America/New_York';
const DEFAULT_DIGEST_TIME = '08:00';
const DEFAULT_REMINDER_MINUTES = 10;
const MAX_CALENDAR_NAME_LENGTH = 50;
const MAX_ICAL_URL_LENGTH = 2048;

const allowAnyUser = authorizeUser({ allowDemo: true });
const requireRealUser = authorizeUser({ allowDemo: false });

function isValidReminderMinutes(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_REMINDER_MINUTES;
}

function serializeEvent(e: CalendarEvent) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    location: e.location,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    isAllDay: e.isAllDay,
    calendarName: e.calendarName,
  };
}

function newUserConfig(userId: string): UserCalendarConfig {
  const now = new Date().toISOString();
  return {
    userId,
    calendars: [],
    reminderMinutes: DEFAULT_REMINDER_MINUTES,
    enabled: true,
    timezone: DEFAULT_TIMEZONE,
    dailyDigestEnabled: false,
    dailyDigestTime: DEFAULT_DIGEST_TIME,
    createdAt: now,
    updatedAt: now,
  };
}

type SettingsPatch = Partial<
  Pick<UserCalendarConfig, 'reminderMinutes' | 'enabled' | 'timezone' | 'dailyDigestEnabled' | 'dailyDigestTime'>
>;

/** Validates the whole body up front so a bad field never leaves a half-applied update. */
function parseSettingsPatch(body: Record<string, unknown>): { patch: SettingsPatch } | { error: string } {
  const { reminderMinutes, enabled, timezone, dailyDigestEnabled, dailyDigestTime } = body;
  const patch: SettingsPatch = {};

  if (reminderMinutes !== undefined) {
    if (!isValidReminderMinutes(reminderMinutes)) {
      return { error: `reminderMinutes must be an integer between 0 and ${MAX_REMINDER_MINUTES}` };
    }
    patch.reminderMinutes = reminderMinutes;
  }
  if (enabled !== undefined) {
    if (typeof enabled !== 'boolean') return { error: 'enabled must be a boolean' };
    patch.enabled = enabled;
  }
  if (timezone !== undefined) {
    if (typeof timezone !== 'string' || !isValidTimezone(timezone)) {
      return { error: 'Invalid IANA timezone' };
    }
    patch.timezone = timezone.trim();
  }
  if (dailyDigestEnabled !== undefined) {
    if (typeof dailyDigestEnabled !== 'boolean') return { error: 'dailyDigestEnabled must be a boolean' };
    patch.dailyDigestEnabled = dailyDigestEnabled;
  }
  if (dailyDigestTime !== undefined) {
    if (typeof dailyDigestTime !== 'string' || !isValid24HourTime(dailyDigestTime)) {
      return { error: 'dailyDigestTime must be in HH:mm 24-hour format' };
    }
    const [hh, mm] = dailyDigestTime.trim().split(':');
    patch.dailyDigestTime = `${hh.padStart(2, '0')}:${mm}`;
  }

  return { patch };
}

function buildTestEvent(isDemo: boolean): CalendarEvent {
  const now = Date.now();
  const timing = {
    start: new Date(now + 10 * 60 * 1000),
    end: new Date(now + 40 * 60 * 1000),
    isAllDay: false,
  };
  return isDemo
    ? {
        id: `demo_test_${now}`,
        title: '🧪 Demo User Test Button Clicked!',
        description: 'Someone just clicked the "🔔 Test DM" button on the public demo-user dashboard!',
        location: 'G-CalBot Public Demo (demo-user)',
        calendarName: 'Demo Dashboard',
        ...timing,
      }
    : {
        id: `test_${now}`,
        title: '🎉 Google Calendar Reminder Test',
        description: 'Your Discord calendar alerts are working properly!',
        location: 'Discord Activity Dashboard',
        ...timing,
      };
}

export function createCalendarRouter(reminderEngine?: ReminderEngine): Router {
  const router = Router();

  router.get('/user/:userId/calendar', allowAnyUser, async (req: Request, res: Response) => {
    const { userId, isDemo } = getAuthorized(res);
    const user = storage.getUser(userId);

    if (!user) {
      return res.json({
        linked: false,
        reminderMinutes: DEFAULT_REMINDER_MINUTES,
        enabled: true,
        timezone: DEFAULT_TIMEZONE,
        dailyDigestEnabled: false,
        dailyDigestTime: DEFAULT_DIGEST_TIME,
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
          isDemo
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
        timezone: user.timezone || DEFAULT_TIMEZONE,
        dailyDigestEnabled: Boolean(user.dailyDigestEnabled),
        dailyDigestTime: user.dailyDigestTime || DEFAULT_DIGEST_TIME,
        calendars: user.calendars || [],
        events: events.map(serializeEvent),
      });
    } catch (err) {
      console.error('Failed to load calendar events for dashboard:', err);
      return res.status(500).json({ error: 'Could not load calendar events. Please try again shortly.' });
    }
  });

  router.post('/user/:userId/calendar', requireRealUser, async (req: Request, res: Response) => {
    const { userId } = getAuthorized(res);
    const { icalUrl, name, reminderMinutes } = req.body ?? {};

    if (!icalUrl || typeof icalUrl !== 'string' || icalUrl.length > MAX_ICAL_URL_LENGTH) {
      return res.status(400).json({ error: 'A valid icalUrl is required.' });
    }
    if (name !== undefined && name !== null && typeof name !== 'string') {
      return res.status(400).json({ error: 'name must be a string.' });
    }
    if (reminderMinutes !== undefined && !isValidReminderMinutes(reminderMinutes)) {
      return res.status(400).json({
        error: `reminderMinutes must be an integer between 0 and ${MAX_REMINDER_MINUTES}`,
      });
    }

    const cleanUrl = CalendarSyncService.sanitizeUrl(icalUrl);
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      return res.status(400).json({
        error:
          'Invalid calendar URL or ID. Please provide your Google Calendar Secret iCal URL, Public Embed link, or Calendar ID.',
      });
    }

    const existing = storage.getUser(userId);
    const calendarCount = existing?.calendars.length ?? 0;
    const isReplacingExisting = existing?.calendars.some((c) => c.url === cleanUrl) ?? false;
    if (!isReplacingExisting && calendarCount >= MAX_CALENDARS_PER_USER) {
      return res.status(400).json({
        error: `You can link up to ${MAX_CALENDARS_PER_USER} calendars. Remove one before adding another.`,
      });
    }

    let events: CalendarEvent[];
    try {
      events = await CalendarSyncService.fetchUpcomingEvents(cleanUrl, 7);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'Could not validate calendar URL';
      return res.status(400).json({ error: message });
    }

    const calendarName =
      (name && name.trim().slice(0, MAX_CALENDAR_NAME_LENGTH)) ||
      (calendarCount > 0 ? `Calendar ${calendarCount + 1}` : 'Primary');

    const linked = storage.addCalendar(
      userId,
      calendarName,
      cleanUrl,
      reminderMinutes ?? existing?.reminderMinutes ?? DEFAULT_REMINDER_MINUTES
    );
    reminderEngine?.invalidateUserCache(userId);

    activityLogger.log(
      'system',
      '📅',
      'Connected a calendar feed via Activity dashboard'
    );

    const updatedUser = storage.getUser(userId);
    res.json({
      success: true,
      calendar: linked,
      totalCalendars: updatedUser?.calendars.length ?? 1,
      eventCount: events.length,
      reminderMinutes: updatedUser?.reminderMinutes,
    });
  });

  // Supports both /calendar/:calId and /calendar?calendarId=, and unlinks everything when neither is given.
  const handleUnlink = (req: Request, res: Response) => {
    const { userId } = getAuthorized(res);
    const rawCalId = req.params.calId;
    const calIdParam = Array.isArray(rawCalId) ? rawCalId[0] : rawCalId;
    const queryId = typeof req.query.calendarId === 'string' ? req.query.calendarId : undefined;
    const calendarId = calIdParam || queryId;

    const removed = storage.removeCalendar(userId, calendarId || 'all');
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

  router.delete('/user/:userId/calendar/:calId', requireRealUser, handleUnlink);
  router.delete('/user/:userId/calendar', requireRealUser, handleUnlink);

  router.patch('/user/:userId/settings', requireRealUser, (req: Request, res: Response) => {
    const { userId } = getAuthorized(res);
    const parsed = parseSettingsPatch(req.body ?? {});
    if ('error' in parsed) {
      return res.status(400).json({ error: parsed.error });
    }

    const user: UserCalendarConfig = {
      ...(storage.getUser(userId) ?? newUserConfig(userId)),
      ...parsed.patch,
      updatedAt: new Date().toISOString(),
    };
    storage.saveUser(user);

    activityLogger.log(
      'system',
      '⚙️',
      `Updated alert preferences via Activity dashboard (${user.reminderMinutes}m prior, TZ: ${user.timezone || DEFAULT_TIMEZONE})`
    );
    res.json({ success: true, user });
  });

  // Each demo click DMs the bot owner, so demo traffic is limited per IP and globally.
  const demoTestPerIp = new FixedWindowLimiter({ windowMs: 60 * 1000, max: 1 });
  const demoTestGlobal = new FixedWindowLimiter({ windowMs: 60 * 1000, max: 5 });
  const userTestLimiter = new FixedWindowLimiter({ windowMs: 15 * 1000, max: 1 });

  router.post('/user/:userId/test', allowAnyUser, async (req: Request, res: Response) => {
    const { userId, session, isDemo } = getAuthorized(res);

    const retryAfterMs = isDemo
      ? demoTestPerIp.hit(clientIp(req)) || demoTestGlobal.hit('global')
      : userTestLimiter.hit(userId);
    if (retryAfterMs > 0) {
      return res.status(429).json({
        error: `Please wait ${Math.ceil(retryAfterMs / 1000)}s before sending another test DM alert.`,
      });
    }

    const targetDiscordUserId = isDemo
      ? (await reminderEngine?.getOwnerUserId()) || config.ownerUserId
      : userId;
    if (!targetDiscordUserId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (isDemo) {
      activityLogger.log('reminder', '🧪', 'Demo Showcase visitor triggered a Test DM alert to bot owner! ;)');
    } else {
      const byUser = session?.username ? ` by ${censorUsername(session.username)}` : '';
      activityLogger.log('reminder', '🔔', `Triggered manual Test DM alert from Activity dashboard${byUser}`);
    }

    const success = reminderEngine
      ? await reminderEngine.sendReminder(targetDiscordUserId, buildTestEvent(isDemo), 10)
      : false;
    res.json({ success, isDemo });
  });

  return router;
}

export default createCalendarRouter;
