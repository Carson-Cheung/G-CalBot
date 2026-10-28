import type { CalendarEvent } from '../types';
import { DAY_MS } from '../constants';

const HOUR_MS = 60 * 60 * 1000;

export function getDayKey(isoString: string, tz?: string, isAllDay?: boolean): string {
  const d = new Date(isoString);
  if (isAllDay) {
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(d);
      const y = parts.find(p => p.type === 'year')?.value;
      const m = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      if (y && m && day) return `${y}-${m}-${day}`;
    } catch {
      // invalid timezone: fall through to the browser's local date
    }
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatGroupDateHeader(dayKey: string, tz: string | undefined, now: Date): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);

  const todayKey = getDayKey(now.toISOString(), tz, false);
  const tomorrowKey = getDayKey(new Date(now.getTime() + DAY_MS).toISOString(), tz, false);

  const dayOfWeek = date.toLocaleDateString(undefined, { weekday: 'long' });
  const monthName = date.toLocaleDateString(undefined, { month: 'short' });
  const dayNum = date.getDate();

  if (dayKey === todayKey) return `Today — ${dayOfWeek}, ${monthName} ${dayNum}`;
  if (dayKey === tomorrowKey) return `Tomorrow — ${dayOfWeek}, ${monthName} ${dayNum}`;
  return `${dayOfWeek} — ${monthName} ${dayNum}`;
}

export function formatEventTime(startIso: string, endIso: string, isAllDay: boolean, tz?: string): string {
  if (isAllDay) return 'All Day';
  try {
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...(tz ? { timeZone: tz } : {}),
    };
    const startFormatted = new Date(startIso).toLocaleTimeString(undefined, timeOptions);
    const endFormatted = new Date(endIso).toLocaleTimeString(undefined, timeOptions);
    return `${startFormatted} – ${endFormatted}`;
  } catch {
    return 'Timed';
  }
}

export function formatClock(now: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    }).format(now);
  } catch {
    return now.toLocaleTimeString();
  }
}

export function getRelativeBadge(
  startIso: string,
  endIso: string,
  isAllDay: boolean,
  tz: string | undefined,
  now: Date
): { text: string; urgent: boolean } {
  const start = new Date(startIso);
  const end = new Date(endIso);

  const todayKey = getDayKey(now.toISOString(), tz, false);
  const startKey = getDayKey(startIso, tz, isAllDay);
  const tomorrowKey = getDayKey(new Date(now.getTime() + DAY_MS).toISOString(), tz, false);

  if (isAllDay) {
    if (startKey === todayKey) return { text: 'Today', urgent: true };
    if (startKey === tomorrowKey) return { text: 'Tomorrow', urgent: false };
    const [sy, sm, sd] = startKey.split('-').map(Number);
    const [ty, tm, td] = todayKey.split('-').map(Number);
    const diffDays = Math.round((Date.UTC(sy, sm - 1, sd) - Date.UTC(ty, tm - 1, td)) / DAY_MS);
    if (diffDays > 1 && diffDays <= 7) return { text: `In ${diffDays}d`, urgent: false };
    return { text: 'Upcoming', urgent: false };
  }

  if (now >= start && now <= end) return { text: 'Happening Now', urgent: true };

  const diffMs = start.getTime() - now.getTime();
  if (diffMs > 0 && diffMs <= HOUR_MS) {
    const mins = Math.max(1, Math.round(diffMs / 60000));
    return { text: `In ${mins}m`, urgent: true };
  }

  if (startKey === todayKey) {
    if (diffMs > 0) return { text: `In ${Math.round(diffMs / HOUR_MS)}h`, urgent: false };
    return { text: 'Today', urgent: false };
  }

  if (startKey === tomorrowKey) return { text: 'Tomorrow', urgent: false };

  const days = Math.ceil(diffMs / DAY_MS);
  if (days > 1 && days <= 7) return { text: `In ${days}d`, urgent: false };

  return { text: 'Upcoming', urgent: false };
}

export function getNextEventCountdown(events: CalendarEvent[], nowMs: number): { countdown: string; title: string } {
  if (events.length === 0) {
    return { countdown: 'No events', title: 'Schedule is clear' };
  }
  const upcoming = events
    .map(e => ({ event: e, startMs: new Date(e.start).getTime(), endMs: new Date(e.end).getTime() }))
    .filter(item => item.endMs >= nowMs)
    .sort((a, b) => a.startMs - b.startMs);

  if (upcoming.length === 0) {
    return { countdown: 'All caught up', title: 'No more events this week' };
  }

  const next = upcoming[0];
  if (nowMs >= next.startMs && nowMs <= next.endMs) {
    return { countdown: 'Now active', title: next.event.title };
  }

  const diffMs = next.startMs - nowMs;
  if (diffMs < HOUR_MS) {
    const mins = Math.max(1, Math.floor(diffMs / 60000));
    return { countdown: `In ${mins}m`, title: next.event.title };
  }
  if (diffMs < DAY_MS) {
    const hrs = Math.floor(diffMs / HOUR_MS);
    const mins = Math.floor((diffMs % HOUR_MS) / 60000);
    return { countdown: `In ${hrs}h ${mins}m`, title: next.event.title };
  }
  const days = Math.floor(diffMs / DAY_MS);
  return { countdown: `In ${days} day${days === 1 ? '' : 's'}`, title: next.event.title };
}

const DURATION_UNITS: Record<string, number> = { d: 1440, h: 60, m: 1 };

/** Parses "45m", "2h", "1h30m", "1d" or "90" (minutes); mirrors the bot's /cal settings parser. */
export function parseDurationMinutes(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, '');
  if (!text) return null;
  if (text === 'now' || text === 'start') return 0;
  if (/^\d+$/.test(text)) return Number(text);
  const normalized = text
    .replace(/days?/g, 'd')
    .replace(/(hours?|hrs?)/g, 'h')
    .replace(/(minutes?|mins?)/g, 'm');
  if (!/^(\d+[dhm])+$/.test(normalized)) return null;
  let total = 0;
  for (const [, amount, unit] of normalized.matchAll(/(\d+)([dhm])/g)) {
    total += Number(amount) * DURATION_UNITS[unit!]!;
  }
  return total;
}

export function formatDurationShort(minutes: number): string {
  if (minutes <= 0) return '0m';
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ');
}
