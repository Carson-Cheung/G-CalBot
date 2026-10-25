/**
 * Time and timezone utilities for calendar calculations and share window parsing.
 */

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
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time.trim());
}

/**
 * Returns timezone-accurate start and end Date objects for a user's day range.
 * Defaults to 'America/New_York' on invalid timezone.
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
  timeZoneOrOffset: string | number = 'America/New_York',
  daysCountOrTimeZone: number | string = 1
): { start: Date; end: Date; dateLabel: string } {
  let tz: string;
  let days: number;
  let isLegacyOffset = false;

  if (typeof timeZoneOrOffset === 'number') {
    isLegacyOffset = true;
    days = timeZoneOrOffset;
    tz = typeof daysCountOrTimeZone === 'string' ? daysCountOrTimeZone : 'America/New_York';
  } else {
    tz = typeof timeZoneOrOffset === 'string' ? timeZoneOrOffset : 'America/New_York';
    days = typeof daysCountOrTimeZone === 'number' ? daysCountOrTimeZone : 1;
  }

  const safeTz = isValidTimezone(tz) ? tz.trim() : 'America/New_York';

  try {
    const dateStr = date.toLocaleDateString('en-CA', { timeZone: safeTz });
    const [y, m, d] = dateStr.split('-').map(Number);

    const startOffset = isLegacyOffset ? days : 0;
    const endOffset = isLegacyOffset ? days : Math.max(0, days - 1);

    const targetStartMidnight = new Date(Date.UTC(y, m - 1, d + startOffset, 12, 0, 0));
    const startDateStr = targetStartMidnight.toLocaleDateString('en-CA', { timeZone: 'UTC' });

    const targetEndMidnight = new Date(Date.UTC(y, m - 1, d + endOffset, 12, 0, 0));
    const endDateStr = targetEndMidnight.toLocaleDateString('en-CA', { timeZone: 'UTC' });

    const startStr = `${startDateStr}T00:00:00`;
    const endStr = `${endDateStr}T23:59:59.999`;

    const current = new Date();
    const tzDate = new Date(current.toLocaleString('en-US', { timeZone: safeTz }));
    const offsetDiff = current.getTime() - tzDate.getTime();

    const dateLabel = date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      timeZone: safeTz,
    });

    return {
      start: new Date(new Date(startStr).getTime() + offsetDiff),
      end: new Date(new Date(endStr).getTime() + offsetDiff),
      dateLabel,
    };
  } catch {
    const fallbackDays = isLegacyOffset ? days : Math.max(0, days - 1);
    const d = new Date(date);
    d.setDate(d.getDate() + fallbackDays);
    d.setHours(23, 59, 59, 999);
    return {
      start: new Date(date),
      end: d,
      dateLabel: date.toDateString(),
    };
  }
}

/**
 * Extracts and parses the `/cal share` `until` parameter into windowEnd, rangeDescription, and windowDays.
 */
export function parseShareWindow(
  untilInput: string,
  now: Date,
  tz: string
): { windowEnd: Date; rangeDescription: string; windowDays: number } {
  const safeTz = isValidTimezone(tz) ? tz.trim() : 'America/New_York';
  const input = (untilInput || '').toLowerCase().trim();

  let windowEnd: Date;
  let rangeDescription: string;

  const dayOfWeekMap: Record<string, number> = {
    sunday: 0, sun: 0,
    monday: 1, mon: 1,
    tuesday: 2, tue: 2,
    wednesday: 3, wed: 3,
    thursday: 4, thu: 4,
    friday: 5, fri: 5,
    saturday: 6, sat: 6,
  };

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  if (input === 'tdy' || input === 'today') {
    windowEnd = getTimezoneDayRange(now, safeTz, 1).end;
    rangeDescription = 'Rest of today';
  } else if (input === 'tmr' || input === 'tomorrow') {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    windowEnd = getTimezoneDayRange(tomorrow, safeTz, 1).end;
    rangeDescription = 'Tomorrow';
  } else if (input === 'week') {
    windowEnd = getTimezoneDayRange(now, safeTz, 7).end;
    rangeDescription = 'Next 7 days';
  } else if (/^(\d+)\s*w$/.test(input)) {
    const weeksMatch = input.match(/^(\d+)/);
    const weeks = weeksMatch ? parseInt(weeksMatch[1], 10) : 1;
    const cappedWeeks = Math.min(Math.max(weeks, 1), 8);
    windowEnd = getTimezoneDayRange(now, safeTz, cappedWeeks * 7).end;
    rangeDescription = `Next ${cappedWeeks} week(s)`;
  } else if (/^(\d+)\s*d$/.test(input)) {
    const daysMatch = input.match(/^(\d+)/);
    const days = daysMatch ? parseInt(daysMatch[1], 10) : 3;
    const cappedDays = Math.min(Math.max(days, 1), 60);
    windowEnd = getTimezoneDayRange(now, safeTz, cappedDays).end;
    rangeDescription = `Next ${cappedDays} day(s)`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split('-').map(Number);
    const targetMidnight = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    windowEnd = getTimezoneDayRange(targetMidnight, safeTz, 1).end;
    rangeDescription = `Until ${input}`;
  } else if (/^([01]?\d|2[0-3]):([0-5]\d)$/.test(input)) {
    const match = input.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)!;
    const hh = match[1].padStart(2, '0');
    const mm = match[2];
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: safeTz });
    const targetIsoStr = `${todayStr}T${hh}:${mm}:00`;
    const current = new Date();
    const tzDate = new Date(current.toLocaleString('en-US', { timeZone: safeTz }));
    const offsetDiff = current.getTime() - tzDate.getTime();
    let timeTarget = new Date(new Date(targetIsoStr).getTime() + offsetDiff);
    if (timeTarget.getTime() <= now.getTime()) {
      timeTarget = new Date(timeTarget.getTime() + 24 * 60 * 60 * 1000);
    }
    windowEnd = timeTarget;
    rangeDescription = `Until ${hh}:${mm}`;
  } else if (input in dayOfWeekMap) {
    const targetDay = dayOfWeekMap[input];
    const nowDayStr = now.toLocaleDateString('en-US', { weekday: 'short', timeZone: safeTz }).toLowerCase();
    const currentDay = dayOfWeekMap[nowDayStr] !== undefined ? dayOfWeekMap[nowDayStr] : now.getDay();
    let diff = (targetDay - currentDay + 7) % 7;
    if (diff === 0) diff = 7;
    const targetDate = new Date(now.getTime() + diff * 24 * 60 * 60 * 1000);
    windowEnd = getTimezoneDayRange(targetDate, safeTz, 1).end;
    rangeDescription = `Until ${dayNames[targetDay]}`;
  } else {
    windowEnd = getTimezoneDayRange(now, safeTz, 3).end;
    rangeDescription = 'Next 3 days';
  }

  const windowDays = Math.max(
    1,
    Math.ceil((windowEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );

  return { windowEnd, rangeDescription, windowDays };
}
