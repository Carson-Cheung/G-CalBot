/**
 * Time and timezone utilities for calendar calculations and share window parsing.
 */

const DEFAULT_TIMEZONE = 'America/New_York';
const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_24H_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

// Bounded by the finite set of valid IANA zones, since only validated zones are cached.
const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function getOffsetFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = offsetFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    offsetFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * Validates whether a given string is a valid IANA timezone identifier.
 */
export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates whether a given string is a 24-hour time format (HH:mm or H:mm).
 */
export function isValid24HourTime(time: string): boolean {
  if (!time || typeof time !== 'string') return false;
  return TIME_24H_PATTERN.test(time.trim());
}

function resolveTimezone(tz: string | undefined): string {
  return tz && isValidTimezone(tz) ? tz.trim() : DEFAULT_TIMEZONE;
}

/**
 * Offset of `timeZone` from UTC at the given instant, in milliseconds (e.g. -4h for EDT).
 */
function getTimezoneOffsetMs(timeZone: string, instant: number): number {
  const parts = getOffsetFormatter(timeZone).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  );
  const wholeSecondInstant = instant - (((instant % 1000) + 1000) % 1000);
  return asUtc - wholeSecondInstant;
}

/**
 * Converts a wall-clock time in `timeZone` to a UTC Date. Wall times that fall in a
 * DST gap resolve forward (e.g. 02:30 on spring-forward day becomes 03:30).
 */
function zonedTimeToUtc(
  date: CalendarDate,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const wallAsUtc = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  const firstOffset = getTimezoneOffsetMs(timeZone, wallAsUtc);
  const secondOffset = getTimezoneOffsetMs(timeZone, wallAsUtc - firstOffset);
  const candidate = wallAsUtc - secondOffset;
  if (getTimezoneOffsetMs(timeZone, candidate) === secondOffset) {
    return new Date(candidate);
  }
  // Neither offset round-trips only inside a DST gap; the later instant is the one just after it.
  return new Date(Math.max(wallAsUtc - firstOffset, wallAsUtc - secondOffset));
}

function getZonedCalendarDate(instant: Date, timeZone: string): CalendarDate {
  const [year, month, day] = instant
    .toLocaleDateString('en-CA', { timeZone })
    .split('-')
    .map(Number);
  return { year, month, day };
}

function addDays(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function startOfZonedDay(date: CalendarDate, timeZone: string): Date {
  return zonedTimeToUtc(date, 0, 0, timeZone);
}

function endOfZonedDay(date: CalendarDate, timeZone: string): Date {
  return new Date(startOfZonedDay(addDays(date, 1), timeZone).getTime() - 1);
}

/**
 * Returns timezone-accurate start and end Date objects for a user's day range.
 * Defaults to 'America/New_York' on invalid timezone.
 *
 * `(date, timeZone, daysCount)` spans `daysCount` days starting on the local day of `date`.
 * `(date, daysOffset, timeZone)` is the legacy form and covers the single day `daysOffset` away.
 */
export function getTimezoneDayRange(
  date: Date,
  timeZone: string,
  daysCount?: number
): { start: Date; end: Date; dateLabel: string };
export function getTimezoneDayRange(
  date: Date,
  daysOffset: number,
  timeZone?: string
): { start: Date; end: Date; dateLabel: string };
export function getTimezoneDayRange(
  date: Date,
  timeZoneOrOffset: string | number = DEFAULT_TIMEZONE,
  daysCountOrTimeZone: number | string = 1
): { start: Date; end: Date; dateLabel: string } {
  let tz: string | undefined;
  let startOffset: number;
  let endOffset: number;

  if (typeof timeZoneOrOffset === 'number') {
    tz = typeof daysCountOrTimeZone === 'string' ? daysCountOrTimeZone : undefined;
    startOffset = timeZoneOrOffset;
    endOffset = timeZoneOrOffset;
  } else {
    tz = timeZoneOrOffset;
    const days = typeof daysCountOrTimeZone === 'number' ? daysCountOrTimeZone : 1;
    startOffset = 0;
    endOffset = Math.max(0, days - 1);
  }

  const safeTz = resolveTimezone(tz);
  const localDate = getZonedCalendarDate(date, safeTz);

  return {
    start: startOfZonedDay(addDays(localDate, startOffset), safeTz),
    end: endOfZonedDay(addDays(localDate, endOffset), safeTz),
    dateLabel: date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      timeZone: safeTz,
    }),
  };
}

const DAY_OF_WEEK: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function clampInt(raw: string, min: number, max: number): number {
  return Math.min(Math.max(parseInt(raw, 10), min), max);
}

/**
 * Extracts and parses the `/cal share` `until` parameter into windowEnd, rangeDescription, and windowDays.
 */
export function parseShareWindow(
  untilInput: string,
  now: Date,
  tz: string
): { windowEnd: Date; rangeDescription: string; windowDays: number } {
  const safeTz = resolveTimezone(tz);
  const input = (untilInput || '').toLowerCase().trim();
  const today = getZonedCalendarDate(now, safeTz);

  let windowEnd: Date;
  let rangeDescription: string;

  const weeksMatch = input.match(/^(\d+)\s*w$/);
  const daysMatch = input.match(/^(\d+)\s*d$/);
  const timeMatch = input.match(TIME_24H_PATTERN);

  if (input === 'tdy' || input === 'today') {
    windowEnd = endOfZonedDay(today, safeTz);
    rangeDescription = 'Rest of today';
  } else if (input === 'tmr' || input === 'tomorrow') {
    windowEnd = endOfZonedDay(addDays(today, 1), safeTz);
    rangeDescription = 'Tomorrow';
  } else if (input === 'week') {
    windowEnd = endOfZonedDay(addDays(today, 6), safeTz);
    rangeDescription = 'Next 7 days';
  } else if (weeksMatch) {
    const weeks = clampInt(weeksMatch[1], 1, 8);
    windowEnd = endOfZonedDay(addDays(today, weeks * 7 - 1), safeTz);
    rangeDescription = `Next ${weeks} week(s)`;
  } else if (daysMatch) {
    const days = clampInt(daysMatch[1], 1, 60);
    windowEnd = endOfZonedDay(addDays(today, days - 1), safeTz);
    rangeDescription = `Next ${days} day(s)`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [year, month, day] = input.split('-').map(Number);
    windowEnd = endOfZonedDay({ year, month, day }, safeTz);
    rangeDescription = `Until ${input}`;
  } else if (timeMatch) {
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    let target = zonedTimeToUtc(today, hour, minute, safeTz);
    if (target.getTime() <= now.getTime()) {
      target = zonedTimeToUtc(addDays(today, 1), hour, minute, safeTz);
    }
    windowEnd = target;
    rangeDescription = `Until ${String(hour).padStart(2, '0')}:${timeMatch[2]}`;
  } else if (input in DAY_OF_WEEK) {
    const targetDay = DAY_OF_WEEK[input];
    const currentDay = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
    const diff = (targetDay - currentDay + 7) % 7 || 7;
    windowEnd = endOfZonedDay(addDays(today, diff), safeTz);
    rangeDescription = `Until ${DAY_NAMES[targetDay]}`;
  } else {
    windowEnd = endOfZonedDay(addDays(today, 2), safeTz);
    rangeDescription = 'Next 3 days';
  }

  const windowDays = Math.max(1, Math.ceil((windowEnd.getTime() - now.getTime()) / DAY_MS) + 1);

  return { windowEnd, rangeDescription, windowDays };
}
