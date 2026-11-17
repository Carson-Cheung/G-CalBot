import { hexToNumber, resolveCalendarColor } from '../calendarColors';
import { Client, EmbedBuilder, User } from 'discord.js';
import { config } from '../config';
import { storage } from '../db/storage';
import { DEMO_USER_ID, resolveUserCalendars } from '../db/userDefaults';
import { CalendarFetchResult, CalendarSyncService, describeFetchError } from './syncService';
import { CalendarEvent, UserCalendarConfig } from '../types';
import {
  floatingDateKey,
  getTimezoneDayRange,
  resolveTimezone,
  zonedDateKey,
  formatDurationMinutes,
} from '../utils/time';
import { activityLogger, censorUsername } from '../utils/activityLogger';

const DEFAULT_DIGEST_TIME = '08:00';
const DEFAULT_WINDOW_DAYS = 7;
const CHECK_INTERVAL_MS = 60 * 1000;
const STARTUP_DELAY_MS = 5000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
// A tick can run late when many feeds are slow; a reminder a few minutes late beats a missed one.
const LATE_REMINDER_GRACE_MS = 5 * 60 * 1000;
const USER_CHECK_CONCURRENCY = 5;
const DIGEST_EVENT_LIMIT = 15;
// After a feed fails with a network error, the next check retries instead of waiting out the cache.
const FAILED_FETCH_RETRY_MS = 60 * 1000;
// A feed that keeps failing for this long is treated as gone: its last known events are
// dropped and fetching goes back to the normal interval.
const STALE_EVENTS_MAX_MS = 60 * 60 * 1000;
const DISCORD_UNKNOWN_USER = 10013;
const DISCORD_DM_DISABLED = 50007;

interface CachedEvents {
  lastFetched: number;
  windowDays: number;
  events: CalendarEvent[];
  /** When the current run of network failures began; unset while every feed is loading. */
  failingSince?: number;
}

type DigestOutcome = 'sent' | 'undeliverable' | 'failed';

/** Minutes since midnight for "HH:mm" or "H:mm"; plain string comparison breaks on unpadded hours. */
function parseClockMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesSinceMidnightIn(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function displayNameOf(user: User): string {
  return user.displayName || user.username || 'User';
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      await worker(items[next++]);
    }
  });
  await Promise.all(runners);
}

export class ReminderEngine {
  private client: Client;
  private cache = new Map<string, CachedEvents>();
  // The latest wider-than-default window per user, so paging a long `/cal share` does not refetch.
  private wideCache = new Map<string, CachedEvents>();
  private inflight = new Map<string, Promise<CalendarFetchResult>>();
  private startupTimer: NodeJS.Timeout | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isChecking = false;

  constructor(client: Client) {
    this.client = client;
  }

  public start() {
    if (this.checkInterval) return;
    console.log('Starting calendar reminder engine...');
    activityLogger.log('system', '📅', 'Starting calendar reminder engine...');
    this.startupTimer = setTimeout(() => this.checkReminders(), STARTUP_DELAY_MS);
    this.checkInterval = setInterval(() => this.checkReminders(), CHECK_INTERVAL_MS);
    this.cleanupInterval = setInterval(() => storage.cleanupOldReminders(), CLEANUP_INTERVAL_MS);
  }

  public stop() {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.checkInterval) clearInterval(this.checkInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.startupTimer = null;
    this.checkInterval = null;
    this.cleanupInterval = null;
  }

  /**
   * Refreshes events for a single user across all linked calendars. Results are cached
   * for the sync interval; concurrent callers share one fetch.
   */
  public async getUserEvents(
    user: UserCalendarConfig,
    forceRefresh = false,
    windowDays = DEFAULT_WINDOW_DAYS
  ): Promise<CalendarEvent[]> {
    const store = windowDays === DEFAULT_WINDOW_DAYS ? this.cache : this.wideCache;
    const entry = store.get(user.userId);
    const cached = entry?.windowDays === windowDays ? entry : undefined;
    const cacheTtl = (config.syncIntervalMinutes || 5) * 60 * 1000;

    if (!forceRefresh && cached && Date.now() - cached.lastFetched < cacheTtl) {
      return cached.events;
    }

    const inflightKey = `${user.userId}:${windowDays}`;
    const pending = this.inflight.get(inflightKey);
    if (pending) {
      return pending.then(
        (result) => result.events,
        () => cached?.events || []
      );
    }

    const failingTooLong =
      cached?.failingSince !== undefined && Date.now() - cached.failingSince > STALE_EVENTS_MAX_MS;
    const fetchPromise = CalendarSyncService.fetchMultipleCalendars(
      resolveUserCalendars(user),
      windowDays,
      failingTooLong ? undefined : cached?.events
    );
    this.inflight.set(inflightKey, fetchPromise);

    try {
      const { events, hadTransientFailure } = await fetchPromise;
      // Skip caching if the cache was invalidated (e.g. calendar linked) mid-fetch.
      if (this.inflight.get(inflightKey) === fetchPromise) {
        const retrySoon = hadTransientFailure && !failingTooLong;
        store.set(user.userId, {
          lastFetched: retrySoon ? Date.now() - cacheTtl + FAILED_FETCH_RETRY_MS : Date.now(),
          windowDays,
          events,
          failingSince: hadTransientFailure ? cached?.failingSince ?? Date.now() : undefined,
        });
      }
      return events;
    } catch (err) {
      console.error(`Failed to fetch calendar for user ${user.userId}: ${describeFetchError(err)}`);
      return cached?.events || [];
    } finally {
      if (this.inflight.get(inflightKey) === fetchPromise) {
        this.inflight.delete(inflightKey);
      }
    }
  }

  /**
   * Makes the next read refetch. The old events stay as the fallback for a feed that
   * fails with a network error, so a sync or an edit during a blip does not empty a calendar.
   */
  public invalidateUserCache(userId: string) {
    for (const store of [this.cache, this.wideCache]) {
      const entry = store.get(userId);
      if (entry) entry.lastFetched = 0;
    }
    this.dropInflight(userId);
  }

  /** Drops everything held in memory for a user whose data was deleted. */
  public forgetUser(userId: string) {
    this.cache.delete(userId);
    this.wideCache.delete(userId);
    this.dropInflight(userId);
  }

  private dropInflight(userId: string) {
    for (const key of this.inflight.keys()) {
      if (key.startsWith(`${userId}:`)) this.inflight.delete(key);
    }
  }

  public async getOwnerUserId(): Promise<string | null> {
    if (config.ownerUserId) {
      return config.ownerUserId;
    }
    try {
      const app = await this.client.application?.fetch();
      const owner = app?.owner;
      if (!owner) return null;
      return 'ownerId' in owner ? owner.ownerId : owner.id;
    } catch (err) {
      console.error('Failed to resolve Discord application owner:', err);
      return null;
    }
  }

  private async checkReminders() {
    if (this.isChecking || !this.client.isReady()) return;
    this.isChecking = true;

    try {
      const users = storage
        .getAllUsers()
        .filter(
          (u) => u.userId !== DEMO_USER_ID && u.enabled && resolveUserCalendars(u).length > 0
        );
      this.pruneCache(new Set(users.map((u) => u.userId)));

      await runWithConcurrency(users, USER_CHECK_CONCURRENCY, async (user) => {
        if (user.dailyDigestEnabled) {
          await this.checkUserDailyDigest(user);
        }
        try {
          await this.dispatchDueReminders(user, await this.getUserEvents(user));
        } catch (err) {
          console.error(`Error processing reminders for user ${user.userId}:`, err);
        }
      });
    } catch (err) {
      console.error('Reminder check failed:', err);
    } finally {
      this.isChecking = false;
    }
  }

  /** Drops cached feeds for users that were deleted or disabled so the cache cannot grow without bound. */
  private pruneCache(activeUserIds: Set<string>) {
    for (const store of [this.cache, this.wideCache]) {
      for (const userId of store.keys()) {
        if (!activeUserIds.has(userId)) store.delete(userId);
      }
    }
  }

  private async dispatchDueReminders(user: UserCalendarConfig, events: CalendarEvent[]) {
    const leadMinutes = user.reminderMinutes ?? 10;
    const leadMs = leadMinutes * 60 * 1000;
    const now = Date.now();

    for (const event of events) {
      if (event.isAllDay) continue;

      const msUntilStart = event.start.getTime() - now;
      if (msUntilStart > leadMs || msUntilStart < -LATE_REMINDER_GRACE_MS) continue;
      if (storage.hasReminderBeenSent(user.userId, event.id, leadMinutes)) continue;

      if (await this.sendReminder(user.userId, event, leadMinutes)) {
        storage.markReminderSent(user.userId, event.id, leadMinutes);
      }
    }
  }

  public async sendReminder(
    userId: string,
    event: CalendarEvent,
    leadMinutes: number
  ): Promise<boolean> {
    try {
      const user = await this.client.users.fetch(userId);

      const startUnix = Math.floor(event.start.getTime() / 1000);
      const endUnix = Math.floor(event.end.getTime() / 1000);
      const titleTag = event.calendarName ? `[${event.calendarName}] ` : '';

      const calendar = storage.getUser(userId)?.calendars.find((c) => c.id === event.calendarId);
      const embed = new EmbedBuilder()
        .setColor(hexToNumber(resolveCalendarColor(calendar?.color).hex))
        .setTitle(truncate(`📅 Reminder: ${titleTag}${event.title}`, 256))
        .setDescription(
          leadMinutes === 0
            ? '**Starting right now!**'
            : `Starting in **${formatDurationMinutes(leadMinutes)}** (<t:${startUnix}:R>)`
        )
        .addFields({
          name: '⏰ Time',
          value: `<t:${startUnix}:F> to <t:${endUnix}:t>`,
          inline: false,
        });

      if (event.location) {
        embed.addFields({ name: '📍 Location', value: event.location, inline: false });
      }

      if (event.description) {
        embed.addFields({
          name: '📝 Description',
          value: event.description.length > 300 ? `${event.description.slice(0, 300)}...` : event.description,
          inline: false,
        });
      }

      embed.setFooter({ text: 'Google Calendar Sync • Privacy Protected' });
      embed.setTimestamp();

      await user.send({ embeds: [embed] });
      console.log(`Sent reminder to user ${userId}`);
      activityLogger.log(
        'reminder',
        '🔔',
        `Dispatched event reminder to ${censorUsername(displayNameOf(user))} (${leadMinutes === 0 ? 'starting now' : `${formatDurationMinutes(leadMinutes)} before`})`
      );
      return true;
    } catch (err: any) {
      if (err?.code === DISCORD_DM_DISABLED) {
        console.warn(`Cannot send DM to user ${userId} (DMs disabled in Discord settings).`);
      } else {
        console.error(`Failed to send reminder DM to user ${userId}:`, err);
      }
      return false;
    }
  }

  private static isEventOnDay(
    event: CalendarEvent,
    dayKey: string,
    dayStart: Date,
    dayEnd: Date
  ): boolean {
    if (event.isAllDay) {
      // DTEND of an all-day event is exclusive.
      return floatingDateKey(event.start) <= dayKey && dayKey < floatingDateKey(event.end);
    }
    return (
      event.start.getTime() <= dayEnd.getTime() && event.end.getTime() >= dayStart.getTime()
    );
  }

  public async sendDailyDigest(userId: string, isTest = false): Promise<boolean> {
    return (await this.deliverDailyDigest(userId, isTest)) === 'sent';
  }

  private async deliverDailyDigest(userId: string, isTest: boolean): Promise<DigestOutcome> {
    const user = storage.getUser(userId);
    if (!user) return 'failed';

    try {
      const discordUser = await this.client.users.fetch(userId);

      const tz = resolveTimezone(user.timezone);
      const now = new Date();
      const todayKey = zonedDateKey(now, tz);
      const todayRange = getTimezoneDayRange(now, tz, 1);

      const allEvents = await this.getUserEvents(user, true);
      const todayEvents = allEvents
        .filter((e) => ReminderEngine.isEventOnDay(e, todayKey, todayRange.start, todayRange.end))
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setAuthor({
          name: `${isTest ? '🧪 [TEST] ' : '🌅 '}Daily Schedule Briefing`,
          iconURL: discordUser.displayAvatarURL(),
        })
        .setTitle(`📅 Today's Agenda • ${todayRange.dateLabel}`);

      if (todayEvents.length === 0) {
        embed.setDescription('🎉 **You have no events scheduled for today!** Enjoy your free day.');
      } else {
        const hidden = todayEvents.length - DIGEST_EVENT_LIMIT;
        embed.setDescription(
          `Good morning! You have **${todayEvents.length} event(s)** scheduled for today:` +
            (hidden > 0 ? `\n*Showing the first ${DIGEST_EVENT_LIMIT}; ${hidden} more not shown.*` : '')
        );
        // Embeds are capped at 6000 characters in total, so per-field sizes stay small.
        for (const ev of todayEvents.slice(0, DIGEST_EVENT_LIMIT)) {
          const startSec = Math.floor(ev.start.getTime() / 1000);
          const endSec = Math.floor(ev.end.getTime() / 1000);
          const calTag = ev.calendarName ? ` [${ev.calendarName}]` : '';
          const square = resolveCalendarColor(user.calendars.find((c) => c.id === ev.calendarId)?.color).emoji;
          const locTag = ev.location ? `\n📍 *${truncate(ev.location, 120)}*` : '';
          const timeStr = ev.isAllDay
            ? '📅 *All Day*'
            : `⏰ <t:${startSec}:t> - <t:${endSec}:t> (<t:${startSec}:R>)`;
          embed.addFields({
            name: truncate(`${square} ${ev.title}${calTag}`, 100),
            value: `${timeStr}${locTag}`,
          });
        }
      }

      embed.setFooter({
        text: `Daily Reminder Set for ${user.dailyDigestTime || DEFAULT_DIGEST_TIME} • G-CalBot`,
      });
      embed.setTimestamp();
      await discordUser.send({ embeds: [embed] });
      activityLogger.log(
        'reminder',
        '📅',
        `Dispatched daily schedule briefing to ${censorUsername(displayNameOf(discordUser))}${isTest ? ' (test)' : ''}`
      );
      return 'sent';
    } catch (err: any) {
      if (err?.code === DISCORD_DM_DISABLED || err?.code === DISCORD_UNKNOWN_USER) {
        console.warn(`Cannot send daily digest to user ${userId} (DMs disabled or account gone).`);
        return 'undeliverable';
      }
      console.error(`Failed to send daily digest to ${userId}:`, err);
      return 'failed';
    }
  }

  /**
   * Sends today's briefing once the user's configured local time has passed.
   */
  private async checkUserDailyDigest(user: UserCalendarConfig) {
    const tz = resolveTimezone(user.timezone);

    try {
      const now = new Date();
      const todayKey = zonedDateKey(now, tz);
      if (user.lastDailyDigestDate === todayKey) return;

      const targetMinutes =
        parseClockMinutes(user.dailyDigestTime || DEFAULT_DIGEST_TIME) ??
        (parseClockMinutes(DEFAULT_DIGEST_TIME) as number);
      if (minutesSinceMidnightIn(now, tz) < targetMinutes) return;

      // A failed send is tried again on the next check. One that cannot arrive (DMs closed)
      // counts as done for today, since retrying would refetch every feed each minute.
      if ((await this.deliverDailyDigest(user.userId, false)) === 'failed') return;

      // Re-read so a settings change saved while the digest was sending is not overwritten.
      // A user who deleted their data in the meantime must not be saved back.
      const latest = storage.getUser(user.userId);
      if (!latest) return;
      latest.lastDailyDigestDate = todayKey;
      storage.saveUser(latest);
    } catch (err) {
      console.error(`Error checking daily digest for user ${user.userId}:`, err);
    }
  }
}
