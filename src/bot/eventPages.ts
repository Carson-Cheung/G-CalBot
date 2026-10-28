import { escapeMarkdown } from 'discord.js';
import { CalendarEvent, UserCalendarConfig } from '../types';
import { floatingDateKey, zonedDateKey } from '../utils/time';
import { PagerOption } from './pager';
import { toUnix } from './helpers';

const DAY_MS = 24 * 60 * 60 * 1000;
// A multi-day event is listed on at most this many day pages.
const MAX_DAYS_PER_EVENT = 14;
const DESCRIPTION_MAX = 4000;

export interface DayGroup {
  key: string;
  events: CalendarEvent[];
}

function addDays(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00Z`);
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function eventDayKeys(event: CalendarEvent, timeZone: string, todayKey: string): string[] {
  // All-day dates are floating; DTEND is exclusive. Long events that began earlier start at today.
  const startKey = event.isAllDay ? floatingDateKey(event.start) : zonedDateKey(event.start, timeZone);
  const first = startKey < todayKey ? todayKey : startKey;
  const last = event.isAllDay
    ? addDays(floatingDateKey(event.end), -1)
    : zonedDateKey(new Date(Math.max(event.end.getTime() - 1, event.start.getTime())), timeZone);

  const keys: string[] = [];
  for (let key = first; key <= last && keys.length < MAX_DAYS_PER_EVENT; key = addDays(key, 1)) {
    keys.push(key);
  }
  return keys.length ? keys : startKey >= todayKey ? [startKey] : [];
}

/** Groups events into one entry per calendar day (in the user's time zone), from today on. */
export function groupEventsByDay(events: CalendarEvent[], timeZone: string, now = new Date()): DayGroup[] {
  const todayKey = zonedDateKey(now, timeZone);
  const days = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    for (const key of eventDayKeys(event, timeZone, todayKey)) {
      const list = days.get(key) ?? [];
      list.push(event);
      days.set(key, list);
    }
  }

  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, list]) => ({
      key,
      events: list.sort(
        (a, b) => Number(b.isAllDay) - Number(a.isAllDay) || a.start.getTime() - b.start.getTime(),
      ),
    }));
}

export function dayTitle(key: string, timeZone: string, now = new Date()): string {
  const label = new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const todayKey = zonedDateKey(now, timeZone);
  if (key === todayKey) return `Today • ${label}`;
  if (key === addDays(todayKey, 1)) return `Tomorrow • ${label}`;
  return label;
}

/** One block per event: bold title, then tree-style detail lines. */
export function formatDayEvents(events: CalendarEvent[], showCalendar: boolean): string {
  const blocks = events.map((event) => {
    const start = toUnix(event.start);
    const end = toUnix(event.end);
    const details = [
      event.isAllDay ? 'All day' : `<t:${start}:t> – <t:${end}:t> (<t:${start}:R>)`,
      event.location ? `📍 ${escapeMarkdown(event.location.slice(0, 200))}` : null,
      showCalendar && event.calendarName ? `🗂️ ${escapeMarkdown(event.calendarName)}` : null,
    ].filter((line): line is string => Boolean(line));

    const lines = details.map((line, i) => `${i === details.length - 1 ? '╰' : '├'} ${line}`);
    const title = escapeMarkdown(event.title.trim().slice(0, 200)) || '(untitled)';
    return [`**${title}**`, ...lines].join('\n');
  });

  let text = '';
  for (let i = 0; i < blocks.length; i++) {
    const next = text ? `${text}\n\n${blocks[i]}` : blocks[i]!;
    if (next.length > DESCRIPTION_MAX) {
      return `${text}\n\n*…and ${blocks.length - i} more*`;
    }
    text = next;
  }
  return text;
}

export const ALL_CALENDARS = 'all';

/** Dropdown options: "All calendars" first, then each linked calendar by name. */
export function calendarFilterOptions(user: UserCalendarConfig): PagerOption[] {
  return [
    { value: ALL_CALENDARS, label: 'All calendars', emoji: '📅' },
    ...user.calendars.map((cal) => ({ value: cal.id, label: cal.name, emoji: '🗂️' })),
  ];
}

/** A calendar unlinked since the message was sent falls back to all calendars. */
export function resolveCalendarFilter(user: UserCalendarConfig, filter: string) {
  const calendar = user.calendars.find((cal) => cal.id === filter);
  return {
    filter: calendar ? calendar.id : ALL_CALENDARS,
    label: calendar?.name ?? 'All calendars',
    calendar,
  };
}

export function applyCalendarFilter(events: CalendarEvent[], calendarId: string | undefined): CalendarEvent[] {
  return calendarId ? events.filter((e) => e.calendarId === calendarId) : events;
}
