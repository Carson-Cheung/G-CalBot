import { Client, EmbedBuilder } from 'discord.js';
import { storage } from '../db/storage';
import { CalendarSyncService } from './syncService';
import { CalendarEvent, UserCalendarConfig } from '../types';

interface CachedEvents {
  lastFetched: number;
  events: CalendarEvent[];
}

export class ReminderEngine {
  private client: Client;
  private cache: Map<string, CachedEvents> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(client: Client) {
    this.client = client;
  }

  public start() {
    console.log('Starting calendar reminder engine...');
    // Run initial check after 5 seconds to let the bot connect
    setTimeout(() => this.checkReminders(), 5000);

    // Check reminders every 60 seconds
    this.checkInterval = setInterval(() => this.checkReminders(), 60 * 1000);

    // Clean up old sent reminders once every 24 hours
    this.cleanupInterval = setInterval(() => {
      storage.cleanupOldReminders();
    }, 24 * 60 * 60 * 1000);
  }

  public stop() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
  }

  /**
   * Refreshes events for a single user across all linked calendars, using cache if younger than 5 minutes.
   */
  public async getUserEvents(user: UserCalendarConfig, forceRefresh = false): Promise<CalendarEvent[]> {
    const cached = this.cache.get(user.userId);
    const now = Date.now();
    const cacheTtl = 5 * 60 * 1000; // 5 minutes

    if (!forceRefresh && cached && now - cached.lastFetched < cacheTtl) {
      return cached.events;
    }

    try {
      // Support both calendars array and legacy icalUrl
      const calendars = user.calendars && user.calendars.length > 0
        ? user.calendars
        : user.icalUrl
        ? [{ id: 'primary', name: 'Primary', url: user.icalUrl, addedAt: user.createdAt }]
        : [];

      const events = await CalendarSyncService.fetchMultipleCalendars(calendars, 7);
      this.cache.set(user.userId, {
        lastFetched: now,
        events
      });
      return events;
    } catch (err) {
      console.error(`Failed to fetch calendar for user ${user.userId}:`, err);
      return cached?.events || [];
    }
  }

  public invalidateUserCache(userId: string) {
    this.cache.delete(userId);
  }

  private async checkReminders() {
    if (!this.client.isReady()) return;

    const users = storage.getAllUsers();
    const now = Date.now();

    for (const user of users) {
      const hasCalendars = (user.calendars && user.calendars.length > 0) || Boolean(user.icalUrl);
      if (!user.enabled || !hasCalendars) continue;

      try {
        const events = await this.getUserEvents(user);
        const reminderLeadMinutes = user.reminderMinutes ?? 10;
        const targetWindowMs = reminderLeadMinutes * 60 * 1000;

        for (const event of events) {
          if (event.isAllDay) continue; // Skip all-day events from minute-level alerts

          const startTime = event.start.getTime();
          const msUntilStart = startTime - now;

          // Check if event start is within the reminder window (lead time down to 1 minute after start)
          if (msUntilStart <= targetWindowMs && msUntilStart >= -60 * 1000) {
            const alreadySent = storage.hasReminderBeenSent(
              user.userId,
              event.id,
              reminderLeadMinutes
            );

            if (!alreadySent) {
              await this.sendReminder(user.userId, event, reminderLeadMinutes);
              storage.markReminderSent(user.userId, event.id, reminderLeadMinutes);
            }
          }
        }
      } catch (err) {
        console.error(`Error processing reminders for user ${user.userId}:`, err);
      }
    }
  }

  public async sendReminder(userId: string, event: CalendarEvent, leadMinutes: number): Promise<boolean> {
    try {
      const user = await this.client.users.fetch(userId);
      if (!user) return false;

      const startUnix = Math.floor(event.start.getTime() / 1000);
      const endUnix = Math.floor(event.end.getTime() / 1000);

      const titleTag = event.calendarName ? `[${event.calendarName}] ` : '';

      const embed = new EmbedBuilder()
        .setColor(0x4285f4) // Google Calendar Blue
        .setTitle(`📅 Reminder: ${titleTag}${event.title}`)
        .setDescription(
          leadMinutes === 0
            ? `**Starting right now!**`
            : `Starting in **${leadMinutes} minutes** (<t:${startUnix}:R>)`
        )
        .addFields(
          {
            name: '⏰ Time',
            value: `<t:${startUnix}:F> to <t:${endUnix}:t>`,
            inline: false
          }
        );

      if (event.location) {
        embed.addFields({ name: '📍 Location', value: event.location, inline: false });
      }

      if (event.description) {
        const truncatedDesc =
          event.description.length > 300
            ? `${event.description.slice(0, 300)}...`
            : event.description;
        embed.addFields({ name: '📝 Description', value: truncatedDesc, inline: false });
      }

      embed.setFooter({
        text: 'Google Calendar Sync • Privacy Protected'
      });
      embed.setTimestamp();

      await user.send({ embeds: [embed] });
      console.log(`Sent reminder to user ${userId} for event "${event.title}"`);
      return true;
    } catch (err: any) {
      if (err.code === 50007) {
        console.warn(`Cannot send DM to user ${userId} (DMs disabled in Discord settings).`);
      } else {
        console.error(`Failed to send reminder DM to user ${userId}:`, err);
      }
      return false;
    }
  }
}
