import { describe, it, expect } from 'vitest';
import {
  getTimezoneDayRange,
  parseShareWindow,
  parseDurationMinutes,
  formatDurationMinutes,
  isValid24HourTime,
} from '../src/utils/time';

describe('getTimezoneDayRange', () => {
  it('uses the local day, not the UTC day, for the range', () => {
    // 02:00 UTC on Mar 2 is still Mar 1 evening in Los Angeles (UTC-8).
    const { start, end } = getTimezoneDayRange(
      new Date('2025-03-02T02:00:00Z'),
      'America/Los_Angeles'
    );
    expect(start.toISOString()).toBe('2025-03-01T08:00:00.000Z');
    expect(end.toISOString()).toBe('2025-03-02T07:59:59.999Z');
  });

  it('gives a 23-hour day across spring-forward', () => {
    const { start, end } = getTimezoneDayRange(
      new Date('2025-03-09T12:00:00Z'),
      'America/New_York'
    );
    expect(end.getTime() - start.getTime() + 1).toBe(23 * 60 * 60 * 1000);
  });

  it('falls back to the default zone for an invalid timezone', () => {
    const bad = getTimezoneDayRange(new Date('2025-06-15T12:00:00Z'), 'Not/AZone');
    const ny = getTimezoneDayRange(new Date('2025-06-15T12:00:00Z'), 'America/New_York');
    expect(bad.start.getTime()).toBe(ny.start.getTime());
  });
});

describe('parseShareWindow', () => {
  const now = new Date('2025-06-15T14:00:00Z'); // 10:00 in New York

  it('"today" ends at local end of day', () => {
    const { windowEnd, rangeDescription } = parseShareWindow('today', now, 'America/New_York');
    expect(windowEnd.toISOString()).toBe('2025-06-16T03:59:59.999Z');
    expect(rangeDescription).toBe('Rest of today');
  });

  it('a clock time already passed rolls over to tomorrow', () => {
    const { windowEnd } = parseShareWindow('09:00', now, 'America/New_York');
    expect(windowEnd.toISOString()).toBe('2025-06-16T13:00:00.000Z');
  });

  it('clamps large day counts and defaults unknown input to 3 days', () => {
    expect(parseShareWindow('999d', now, 'UTC').rangeDescription).toBe('Next 60 day(s)');
    expect(parseShareWindow('gibberish', now, 'UTC').rangeDescription).toBe('Next 3 days');
  });
});

describe('duration helpers', () => {
  it('parses combined and bare-number lead times', () => {
    expect(parseDurationMinutes('1h30m')).toBe(90);
    expect(parseDurationMinutes('2 days')).toBe(2880);
    expect(parseDurationMinutes('45')).toBe(45);
    expect(parseDurationMinutes('now')).toBe(0);
    expect(parseDurationMinutes('soon')).toBeNull();
  });

  it('formats minutes with correct pluralisation', () => {
    expect(formatDurationMinutes(1500)).toBe('1 day 1 hour');
    expect(formatDurationMinutes(0)).toBe('at start');
  });

  it('validates 24-hour times', () => {
    expect(isValid24HourTime('9:05')).toBe(true);
    expect(isValid24HourTime('24:00')).toBe(false);
    expect(isValid24HourTime('12:60')).toBe(false);
  });
});
