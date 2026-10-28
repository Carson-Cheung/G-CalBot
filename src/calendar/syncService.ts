import nodeIcal from 'node-ical';
import type { EventInstance, ParameterValue, VEvent } from 'node-ical';
import net from 'net';
import type { LookupFunction } from 'net';
import dns from 'dns';
import http from 'http';
import https from 'https';
import { CalendarEvent, LinkedCalendar } from '../types';
import { getTimezoneDayRange } from '../utils/time';

const DAY_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const MAX_EVENTS_PER_CALENDAR = 500;
const MAX_OCCURRENCES_PER_EVENT = 100;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** iCal text properties arrive as `{ val, params }` when they carry parameters such as LANGUAGE. */
function textValue(value: ParameterValue | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = typeof value === 'object' ? value.val : value;
  const trimmed = String(raw ?? '').trim();
  return trimmed || undefined;
}

/** Expands an IPv6 address (including `::` and a dotted IPv4 tail) into eight 16-bit groups. */
function expandIpv6(ip: string): number[] | null {
  let address = ip.toLowerCase().split('%')[0];
  const dotted = address.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    if (!net.isIPv4(dotted[2])) return null;
    const [a, b, c, d] = dotted[2].split('.').map(Number);
    address = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const halves = address.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string) => (part ? part.split(':') : []);
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;

  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

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
          try {
            const decoded = decodeURIComponent(srcMatch[1]);
            return `https://calendar.google.com/calendar/ical/${encodeURIComponent(decoded)}/public/basic.ics`;
          } catch {}
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
          if (!cid.includes('@') && /^[A-Za-z0-9+/=]+$/.test(cid)) {
            const b64 = Buffer.from(cid, 'base64').toString('utf-8');
            if (b64.includes('@') || b64.includes('.')) {
              decodedCid = b64;
            }
          }
          return `https://calendar.google.com/calendar/ical/${encodeURIComponent(decodedCid)}/public/basic.ics`;
        }
      } catch {}
    }

    // 5. Handle raw Google Calendar IDs pasted directly:
    // e.g. nba_-m-0bwjj_%42oston+%43eltics#sports@group.v.calendar.google.com
    // or en.canadian#holiday@group.v.calendar.google.com
    // or c_...#sports@group.v.calendar.google.com
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

    const groups = expandIpv6(ip);
    if (!groups) return true;
    const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
    const embeddedV4 = (hi: number, lo: number) =>
      CalendarSyncService.isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    const zeroPrefix = (count: number) => groups.slice(0, count).every((g) => g === 0);

    // IPv4-mapped (::ffff:0:0/96)
    if (zeroPrefix(5) && g5 === 0xffff) return embeddedV4(g6, g7);
    // Unspecified, loopback and deprecated IPv4-compatible (::/96)
    if (zeroPrefix(6)) return true;
    // NAT64 well-known prefix (64:ff9b::/96) translates to the embedded IPv4 host
    if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
      return embeddedV4(g6, g7);
    }
    // Local-use NAT64 (64:ff9b:1::/48)
    if (g0 === 0x64 && g1 === 0xff9b && g2 === 1) return true;
    // 6to4 (2002::/16) embeds an IPv4 host in bits 16-47
    if (g0 === 0x2002) return embeddedV4(g1, g2);
    // Teredo (2001::/32) and documentation (2001:db8::/32)
    if (g0 === 0x2001 && (g1 === 0 || g1 === 0xdb8)) return true;
    // Unique local (fc00::/7)
    if ((g0 & 0xfe00) === 0xfc00) return true;
    // Link-local (fe80::/10) and deprecated site-local (fec0::/10)
    if ((g0 & 0xffc0) === 0xfe80 || (g0 & 0xffc0) === 0xfec0) return true;
    // Multicast (ff00::/8)
    if (g0 >> 8 === 0xff) return true;

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
      // WHATWG URL keeps the brackets around IPv6 literals.
      const host = parsedUrl.hostname.toLowerCase().replace(/^\[|\]$/g, '');
      if (
        host === 'localhost' ||
        host.endsWith('.localhost') ||
        host.endsWith('.local') ||
        host.endsWith('.internal') ||
        host.endsWith('.arpa') ||
        host.endsWith('.home') ||
        host.endsWith('.corp') ||
        host.endsWith('.lan')
      ) {
        return false;
      }

      if (net.isIP(host)) {
        return !CalendarSyncService.isPrivateIp(host);
      }

      // Numeric/hex/octal IP evasion (e.g. 2130706433, 0x7f000001, 0177.1)
      if (/^(0x[0-9a-f]*|\d+)(\.(0x[0-9a-f]*|\d+))*\.?$/.test(host)) {
        return false;
      }

      const records = await dns.promises.lookup(host, { all: true });
      if (records.length === 0) return false;
      return records.every((record) => !CalendarSyncService.isPrivateIp(record.address));
    } catch {
      return false;
    }
  }

  /**
   * DNS lookup used for the actual connection. Validating here (not only in
   * isSafeFeedUrl) closes the DNS-rebinding gap: the address that is checked is
   * the address the socket connects to.
   */
  private static safeLookup: LookupFunction = (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) {
        callback(err, '', 0);
        return;
      }
      const list = addresses as dns.LookupAddress[];
      if (list.length === 0 || list.some((a) => CalendarSyncService.isPrivateIp(a.address))) {
        const blocked: NodeJS.ErrnoException = new Error(
          'Invalid calendar URL or access to private/local network hosts is not permitted.'
        );
        blocked.code = 'ERR_PRIVATE_ADDRESS';
        callback(blocked, '', 0);
        return;
      }
      if (options.all) {
        callback(null, list);
      } else {
        callback(null, list[0].address, list[0].family);
      }
    });
  };

  private static requestOnce(url: URL, signal: AbortSignal): Promise<http.IncomingMessage> {
    const transport = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const req = transport.get(
        url,
        {
          lookup: CalendarSyncService.safeLookup,
          // A pooled socket could have been opened without safeLookup.
          agent: false,
          signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; DiscordGCalBot/1.0)',
            Accept: 'text/calendar, text/plain, */*',
          },
        },
        resolve
      );
      req.on('error', reject);
    });
  }

  /**
   * Downloads a feed, following redirects manually so every hop is re-checked
   * against the SSRF rules, and caps the body size while streaming.
   */
  private static async downloadFeed(url: string): Promise<string> {
    let currentUrl = url;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // Fast rejection for literals and blocked names; safeLookup guards the connection itself.
      if (!(await CalendarSyncService.isSafeFeedUrl(currentUrl))) {
        throw new Error(
          'Invalid calendar URL or access to private/local network hosts is not permitted.'
        );
      }

      const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
      const response = await CalendarSyncService.requestOnce(new URL(currentUrl), signal);
      const status = response.statusCode ?? 0;

      if (REDIRECT_STATUSES.has(status)) {
        response.destroy();
        const location = response.headers.location;
        if (!location) {
          throw new Error('Received redirect without Location header');
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (status < 200 || status >= 300) {
        response.destroy();
        if (status === 404 || status === 403) {
          throw new Error(
            'Could not access the calendar. Make sure you copied the "Secret address in iCal format" from Google Calendar settings.'
          );
        }
        throw new Error(`Failed to download calendar (HTTP status ${status})`);
      }

      return CalendarSyncService.readBodyWithLimit(response, MAX_FEED_BYTES);
    }

    throw new Error('Calendar URL redirected too many times.');
  }

  private static async readBodyWithLimit(
    response: http.IncomingMessage,
    maxBytes: number
  ): Promise<string> {
    const tooLarge = () =>
      new Error(`Calendar feed exceeds maximum allowed size (${maxBytes / 1024 / 1024}MB).`);

    if (Number(response.headers['content-length']) > maxBytes) {
      response.destroy();
      throw tooLarge();
    }

    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of response as AsyncIterable<Buffer>) {
      total += chunk.length;
      if (total > maxBytes) {
        response.destroy();
        throw tooLarge();
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
  }

  /**
   * Expands parsed VEVENTs (RRULE, EXDATE and RECURRENCE-ID overrides) into
   * concrete occurrences inside the window that have not ended yet.
   */
  public static extractEvents(
    icsData: string,
    windowDays: number,
    calendarName?: string,
    now: Date = new Date()
  ): CalendarEvent[] {
    const parsed = nodeIcal.sync.parseICS(icsData);
    const rangeStart = new Date(now.getTime() - DAY_MS);
    const rangeEnd = new Date(now.getTime() + windowDays * DAY_MS);
    const eventMap = new Map<string, CalendarEvent>();

    for (const component of Object.values(parsed)) {
      if (!component || component.type !== 'VEVENT') continue;
      const vevent = component as VEvent;
      if (vevent.status === 'CANCELLED' || !vevent.start) continue;

      let instances: EventInstance[];
      try {
        instances = nodeIcal.expandRecurringEvent(vevent, { from: rangeStart, to: rangeEnd });
      } catch (err) {
        console.warn('Error expanding calendar event:', err);
        continue;
      }

      // Bound occurrences so a high-frequency RRULE cannot flood the event list.
      for (const instance of instances.slice(0, MAX_OCCURRENCES_PER_EVENT)) {
        const source = instance.event;
        if (source.status === 'CANCELLED') continue;

        const start = new Date(instance.start);
        const end = new Date(instance.end);
        // All-day dates are anchored to server-local midnight, so give a day of slack
        // for users whose local day ends later than the server's.
        const effectiveEnd = instance.isFullDay ? end.getTime() + DAY_MS : end.getTime();
        if (effectiveEnd < now.getTime()) continue;

        // Bounded lengths keep Discord embeds under their field limits (error 50035).
        const title =
          (textValue(instance.summary) ?? textValue(vevent.summary) ?? '').slice(0, 200) ||
          '(No Title)';
        const description = (textValue(source.description) ?? textValue(vevent.description))?.slice(0, 1000);
        const location = (textValue(source.location) ?? textValue(vevent.location))?.slice(0, 250);

        // Start time is part of the id so a rescheduled event earns a fresh reminder.
        const id = `${vevent.uid || title}_${start.getTime()}`;
        eventMap.set(id, {
          id,
          title,
          description,
          location,
          start,
          end,
          isAllDay: instance.isFullDay,
          calendarName,
        });
      }
    }

    return Array.from(eventMap.values())
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, MAX_EVENTS_PER_CALENDAR);
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
    const icsData = await CalendarSyncService.downloadFeed(
      CalendarSyncService.sanitizeUrl(icalUrl)
    );
    if (!icsData.includes('BEGIN:VCALENDAR')) {
      throw new Error(
        'The provided link or ID did not return a valid iCalendar (.ics) stream. Make sure the calendar is public or use your secret iCal address.'
      );
    }
    return CalendarSyncService.extractEvents(icsData, windowDays, calendarName);
  }

  /**
   * Fetches multiple calendars concurrently, combines them, deduplicates, and sorts chronologically.
   */
  public static async fetchMultipleCalendars(
    calendars: LinkedCalendar[],
    windowDays: number = 7
  ): Promise<CalendarEvent[]> {
    const results = await Promise.allSettled(
      calendars.map((cal) =>
        CalendarSyncService.fetchUpcomingEvents(cal.url, windowDays, cal.name).then((events) =>
          events.map((ev) => ({ ...ev, calendarId: cal.id }))
        )
      )
    );

    const merged = new Map<string, CalendarEvent>();
    for (const res of results) {
      if (res.status === 'fulfilled') {
        for (const ev of res.value) {
          if (!merged.has(ev.id)) merged.set(ev.id, ev);
        }
      } else {
        console.warn('Could not fetch one of the user calendars:', res.reason);
      }
    }

    return Array.from(merged.values()).sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  /**
   * Timezone-accurate start and end Date objects for a user's day range.
   * Static wrapper preserving backwards compatibility with existing callers.
   */
  public static getTimezoneDayRange = getTimezoneDayRange;
}
