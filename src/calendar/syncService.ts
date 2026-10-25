import nodeIcal from 'node-ical';
import { CalendarEvent, LinkedCalendar } from '../types';
import { getTimezoneDayRange } from '../utils/time';

export class CalendarSyncService {
  /**
   * Cleans up webcal:// to https:// and validates URL format.
   */
  public static sanitizeUrl(url: string): string {
    let clean = url.trim();
    if (clean.startsWith('webcal://')) {
      clean = 'https://' + clean.slice('webcal://'.length);
    }
    return clean;
  }

  /**
   * Validates URL format and prevents SSRF to internal/loopback addresses.
   */
  public static isSafeFeedUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return false;
      }
      const host = parsedUrl.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host === '::1' ||
        host === '169.254.169.254' ||
        host.endsWith('.local') ||
        host.endsWith('.internal')
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fetches and parses calendar events within a specified date window.
   */
  public static async fetchUpcomingEvents(
    icalUrl: string,
    windowDays: number = 7,
    calendarName?: string
  ): Promise<CalendarEvent[]> {
    const cleanUrl = this.sanitizeUrl(icalUrl);

    // Validate URL and prevent SSRF to internal/loopback addresses
    if (!CalendarSyncService.isSafeFeedUrl(cleanUrl)) {
      throw new Error('Invalid calendar URL or access to private/local network hosts is not permitted.');
    }

    // Fetch the raw iCalendar data with a 10-second timeout
    const response = await fetch(cleanUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DiscordGCalBot/1.0)'
      }
    });

    if (!response.ok) {
      if (response.status === 404 || response.status === 403) {
        throw new Error(
          'Could not access the calendar. Make sure you copied the "Secret address in iCal format" from Google Calendar settings.'
        );
      }
      throw new Error(`Failed to download calendar (HTTP status ${response.status})`);
    }

    const icsData = await response.text();
    const parsed = nodeIcal.sync.parseICS(icsData);

    const now = new Date();
    const rangeStart = new Date(now.getTime() - 24 * 60 * 60 * 1000); // include 24h past
    const rangeEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

    const events: CalendarEvent[] = [];

    for (const k in parsed) {
      if (!Object.prototype.hasOwnProperty.call(parsed, k)) continue;
      const item = parsed[k] as any;

      if (!item || item.type !== 'VEVENT') continue;

      const title = item.summary ? String(item.summary).trim() : '(No Title)';
      const description = item.description ? String(item.description).trim() : undefined;
      const location = item.location ? String(item.location).trim() : undefined;
      const isAllDay = item.datetype === 'date';

      // Handling recurring events
      if (item.rrule) {
        try {
          const dates = item.rrule.between(rangeStart, rangeEnd, true);
          const duration =
            item.end && item.start
              ? new Date(item.end).getTime() - new Date(item.start).getTime()
              : 60 * 60 * 1000;

          for (const date of dates) {
            // Check if this specific date is an exception (deleted instance)
            const dateStr = date.toISOString().split('T')[0];
            let isException = false;
            if (item.exdate) {
              for (const exDateKey in item.exdate) {
                const ex = new Date(exDateKey);
                if (!isNaN(ex.getTime())) {
                  if (ex.toISOString().split('T')[0] === dateStr) {
                    isException = true;
                    break;
                  }
                }
              }
            }

            if (isException) continue;

            const instanceStart = new Date(date);
            const instanceEnd = new Date(date.getTime() + duration);

            events.push({
              id: `${item.uid}_${instanceStart.getTime()}`,
              title,
              description,
              location,
              start: instanceStart,
              end: instanceEnd,
              isAllDay,
              calendarName
            });
          }
        } catch (rruleErr) {
          console.warn('Error expanding recurring rule:', rruleErr);
        }
      } else if (item.start) {
        // Non-recurring event
        const start = new Date(item.start);
        const end = item.end ? new Date(item.end) : new Date(start.getTime() + 60 * 60 * 1000);

        if (start >= rangeStart && start <= rangeEnd) {
          events.push({
            id: String(item.uid || `${start.getTime()}_${title}`),
            title,
            description,
            location,
            start,
            end,
            isAllDay,
            calendarName
          });
        }
      }
    }

    // Deduplicate and sort ascending by start time
    const eventMap = new Map<string, CalendarEvent>();
    for (const ev of events) {
      eventMap.set(ev.id, ev);
    }
    const deduplicated = Array.from(eventMap.values());
    deduplicated.sort((a, b) => a.start.getTime() - b.start.getTime());

    return deduplicated;
  }

  /**
   * Fetches multiple calendars concurrently, combines them, deduplicates, and sorts chronologically.
   */
  public static async fetchMultipleCalendars(
    calendars: LinkedCalendar[],
    windowDays: number = 7
  ): Promise<CalendarEvent[]> {
    const results = await Promise.allSettled(
      calendars.map(cal => this.fetchUpcomingEvents(cal.url, windowDays, cal.name))
    );

    const merged: CalendarEvent[] = [];
    const seenIds = new Set<string>();

    for (const res of results) {
      if (res.status === 'fulfilled') {
        for (const ev of res.value) {
          if (!seenIds.has(ev.id)) {
            seenIds.add(ev.id);
            merged.push(ev);
          }
        }
      } else {
        console.warn('Could not fetch one of the user calendars:', res.reason);
      }
    }

    merged.sort((a, b) => a.start.getTime() - b.start.getTime());
    return merged;
  }

  /**
   * Timezone-accurate start and end Date objects for a user's day range.
   * Static wrapper preserving backwards compatibility with existing callers.
   */
  public static getTimezoneDayRange = getTimezoneDayRange;
}
