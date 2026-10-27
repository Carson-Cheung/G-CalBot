import nodeIcal from 'node-ical';
import net from 'net';
import dns from 'dns';
import { CalendarEvent, LinkedCalendar } from '../types';
import { getTimezoneDayRange } from '../utils/time';

export class CalendarSyncService {
  /**
   * Cleans up raw calendar inputs, converting:
   * - webcal:// to https://
   * - Google Calendar Embed URLs & iframes to public iCal feeds
   * - Google Calendar IDs (e.g. Sports, Holidays, Group calendars) to public iCal feeds
   */
  public static sanitizeUrl(url: string): string {
    let clean = (url || '').trim();

    // 1. If wrapped in an iframe embed snippet: <iframe src="https://..."></iframe>
    const iframeMatch = clean.match(/src=["']([^"']+)["']/i);
    if (iframeMatch) {
      clean = iframeMatch[1].trim();
    }

    // 2. Normalize webcal:// to https://
    if (clean.startsWith('webcal://')) {
      clean = 'https://' + clean.slice('webcal://'.length);
    }

    // 3. Handle Google Calendar Embed URLs:
    // e.g. https://calendar.google.com/calendar/embed?src=nba_-m-0bwjj_%2542oston%2B%2543eltics%23sports%40group.v.calendar.google.com&ctz=...
    if (clean.includes('calendar.google.com') && clean.includes('embed')) {
      try {
        const parsed = new URL(clean);
        const src = parsed.searchParams.get('src');
        if (src) {
          return `https://calendar.google.com/calendar/ical/${encodeURIComponent(src)}/public/basic.ics`;
        }
      } catch {
        const srcMatch = clean.match(/[?&]src=([^&]+)/i);
        if (srcMatch) {
          const decoded = decodeURIComponent(srcMatch[1]);
          return `https://calendar.google.com/calendar/ical/${encodeURIComponent(decoded)}/public/basic.ics`;
        }
      }
    }

    // 4. Handle Google Calendar CID share links:
    // e.g. https://calendar.google.com/calendar/r?cid=...
    if (clean.includes('calendar.google.com') && clean.includes('cid=')) {
      try {
        const parsed = new URL(clean);
        const cid = parsed.searchParams.get('cid');
        if (cid) {
          let decodedCid = cid;
          try {
            if (!cid.includes('@') && /^[A-Za-z0-9+/=]+$/.test(cid)) {
              const b64 = Buffer.from(cid, 'base64').toString('utf-8');
              if (b64.includes('@') || b64.includes('.')) {
                decodedCid = b64;
              }
            }
          } catch {}
          return `https://calendar.google.com/calendar/ical/${encodeURIComponent(decodedCid)}/public/basic.ics`;
        }
      } catch {}
    }

    // 5. Handle raw Google Calendar IDs pasted directly:
    // e.g. nba_-m-0bwjj_%42oston+%43eltics#sports@group.v.calendar.google.com
    // or en.canadian#holiday@group.v.calendar.google.com
    // or c_...#sports@group.v.calendar.google.com
    // or any calendar ID containing @group.calendar.google.com or @group.v.calendar.google.com
    if (
      !clean.startsWith('http://') &&
      !clean.startsWith('https://') &&
      (clean.includes('@group.v.calendar.google.com') ||
       clean.includes('@group.calendar.google.com') ||
       clean.includes('@import.calendar.google.com') ||
       clean.endsWith('calendar.google.com'))
    ) {
      return `https://calendar.google.com/calendar/ical/${encodeURIComponent(clean)}/public/basic.ics`;
    }

    return clean;
  }

  /**
   * Checks if an IP address belongs to a private, loopback, link-local, or reserved network range.
   */
  public static isPrivateIp(ip: string): boolean {
    if (!net.isIP(ip)) return true;

    if (net.isIPv4(ip)) {
      const parts = ip.split('.').map((p) => parseInt(p, 10));
      if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
        return true;
      }
      // 0.0.0.0/8 (Broadcast/Current network)
      if (parts[0] === 0) return true;
      // 10.0.0.0/8 (RFC 1918 Private)
      if (parts[0] === 10) return true;
      // 100.64.0.0/10 (RFC 6598 Carrier-Grade NAT)
      if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
      // 127.0.0.0/8 (Loopback)
      if (parts[0] === 127) return true;
      // 169.254.0.0/16 (RFC 3927 Link-Local / Cloud Metadata e.g. AWS/GCP/Azure)
      if (parts[0] === 169 && parts[1] === 254) return true;
      // 172.16.0.0/12 (RFC 1918 Private)
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      // 192.0.0.0/24 (IETF Protocol Assignments) & 192.0.2.0/24 (TEST-NET-1)
      if (parts[0] === 192 && parts[1] === 0 && (parts[2] === 0 || parts[2] === 2)) return true;
      // 192.168.0.0/16 (RFC 1918 Private)
      if (parts[0] === 192 && parts[1] === 168) return true;
      // 198.18.0.0/15 (Network Benchmark Tests)
      if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
      // 198.51.100.0/24 (TEST-NET-2) & 203.0.113.0/24 (TEST-NET-3)
      if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true;
      if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true;
      // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
      if (parts[0] >= 224) return true;

      return false;
    }

    // IPv6 checks
    const normalized = ip.toLowerCase();
    if (normalized === '::1' || normalized === '::') return true;
    // IPv4-mapped IPv6 (::ffff:127.0.0.1)
    if (normalized.startsWith('::ffff:')) {
      const v4Part = normalized.slice(7);
      if (net.isIPv4(v4Part)) return CalendarSyncService.isPrivateIp(v4Part);
    }
    // Unique local (fc00::/7)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    // Link-local (fe80::/10)
    if (/^fe[89ab]/i.test(normalized)) return true;

    return false;
  }

  /**
   * Validates URL format and prevents SSRF to internal/loopback/cloud metadata addresses,
   * resolving hostnames to IPs to protect against DNS rebinding.
   */
  public static async isSafeFeedUrl(url: string): Promise<boolean> {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return false;
      }
      const host = parsedUrl.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '0.0.0.0' ||
        host === '::1' ||
        host === '[::1]' ||
        host.endsWith('.local') ||
        host.endsWith('.internal') ||
        host.endsWith('.arpa') ||
        host.endsWith('.home') ||
        host.endsWith('.corp') ||
        host.endsWith('.lan')
      ) {
        return false;
      }

      // If host is a direct IP address, validate it immediately
      if (net.isIP(host)) {
        return !CalendarSyncService.isPrivateIp(host);
      }

      // Check numeric/hex/octal IP evasion (e.g. 2130706433 or 0x7f000001)
      if (/^[\d.xabcdefABCDEF]+$/.test(host)) {
        return false;
      }

      // Resolve DNS to verify that all resolved endpoint IPs are public
      try {
        const records = await dns.promises.lookup(host, { all: true });
        if (!records || records.length === 0) return false;
        for (const record of records) {
          if (CalendarSyncService.isPrivateIp(record.address)) {
            return false;
          }
        }
      } catch {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fetches and parses calendar events within a specified date window.
   * Protects against SSRF redirect bypasses and memory exhaustion.
   */
  public static async fetchUpcomingEvents(
    icalUrl: string,
    windowDays: number = 7,
    calendarName?: string
  ): Promise<CalendarEvent[]> {
    const cleanUrl = this.sanitizeUrl(icalUrl);

    // Follow redirects manually to re-verify destination IPs against SSRF at each hop
    let currentUrl = cleanUrl;
    let response: Response | null = null;
    const maxRedirects = 5;

    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (!(await CalendarSyncService.isSafeFeedUrl(currentUrl))) {
        throw new Error(
          'Invalid calendar URL or access to private/local network hosts is not permitted.'
        );
      }

      response = await fetch(currentUrl, {
        signal: AbortSignal.timeout(10000),
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DiscordGCalBot/1.0)',
          Accept: 'text/calendar, text/plain, */*',
        },
      });

      if (
        response.status === 301 ||
        response.status === 302 ||
        response.status === 303 ||
        response.status === 307 ||
        response.status === 308
      ) {
        const location = response.headers.get('location');
        if (!location) {
          throw new Error('Received redirect without Location header');
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      break;
    }

    if (!response || !response.ok) {
      if (response && (response.status === 404 || response.status === 403)) {
        throw new Error(
          'Could not access the calendar. Make sure you copied the "Secret address in iCal format" from Google Calendar settings.'
        );
      }
      throw new Error(`Failed to download calendar (HTTP status ${response?.status || 'network error'})`);
    }

    // Limit maximum response size to 5MB to avoid memory exhaustion
    const MAX_FEED_BYTES = 5 * 1024 * 1024;
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_FEED_BYTES) {
      throw new Error('Calendar feed exceeds maximum allowed size (5MB).');
    }

    const icsData = await response.text();
    if (icsData.length > MAX_FEED_BYTES) {
      throw new Error('Calendar feed exceeds maximum allowed size (5MB).');
    }
    if (!icsData.includes('BEGIN:VCALENDAR')) {
      throw new Error(
        'The provided link or ID did not return a valid iCalendar (.ics) stream. Make sure the calendar is public or use your secret iCal address.'
      );
    }
    const parsed = nodeIcal.sync.parseICS(icsData);

    const now = new Date();
    const rangeStart = new Date(now.getTime() - 24 * 60 * 60 * 1000); // include 24h past
    const rangeEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

    const events: CalendarEvent[] = [];
    const MAX_EVENTS_PER_CALENDAR = 500;

    for (const k in parsed) {
      if (events.length >= MAX_EVENTS_PER_CALENDAR) break;
      if (!Object.prototype.hasOwnProperty.call(parsed, k)) continue;
      const item = parsed[k] as any;

      if (!item || item.type !== 'VEVENT') continue;

      // Bound string lengths to prevent Discord API Form Body 50035 errors and memory bloat
      const title = item.summary ? String(item.summary).trim().slice(0, 200) : '(No Title)';
      const description = item.description ? String(item.description).trim().slice(0, 1000) : undefined;
      const location = item.location ? String(item.location).trim().slice(0, 250) : undefined;
      const isAllDay = item.datetype === 'date';

      // Handling recurring events
      if (item.rrule) {
        try {
          // Bound recurring occurrences to prevent high-frequency recurrence expansion DoS
          const dates = item.rrule.between(rangeStart, rangeEnd, true).slice(0, 100);
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

            // Skip events that have already ended before now
            if (instanceEnd < now) continue;

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

        if (start >= rangeStart && start <= rangeEnd && end >= now) {
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
