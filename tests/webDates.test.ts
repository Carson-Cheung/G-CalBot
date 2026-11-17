import { describe, it, expect } from 'vitest';
import { formatEventTime, getDisplayDayKey, getRelativeBadge } from '../src/web/utils/dates';

const now = new Date('2025-03-05T15:00:00Z');
const tz = 'UTC';

describe('getRelativeBadge (all-day)', () => {
  it('labels an all-day event today', () => {
    expect(getRelativeBadge('2025-03-05T00:00:00Z', '2025-03-06T00:00:00Z', true, tz, now).text).toBe('Today');
  });

  it('labels an all-day event tomorrow', () => {
    expect(getRelativeBadge('2025-03-06T00:00:00Z', '2025-03-07T00:00:00Z', true, tz, now).text).toBe('Tomorrow');
  });

  it('labels an ongoing multi-day all-day event as Today', () => {
    expect(getRelativeBadge('2025-03-03T00:00:00Z', '2025-03-08T00:00:00Z', true, tz, now).text).toBe('Today');
  });
});

describe('getDisplayDayKey', () => {
  it('uses the start day for future events', () => {
    expect(getDisplayDayKey({ start: '2025-03-07T10:00:00Z', isAllDay: false }, tz, now)).toBe('2025-03-07');
  });

  it('uses today for ongoing events that started earlier', () => {
    expect(getDisplayDayKey({ start: '2025-03-03T00:00:00Z', isAllDay: true }, tz, now)).toBe('2025-03-05');
    expect(getDisplayDayKey({ start: '2025-03-03T09:00:00Z', isAllDay: false }, tz, now)).toBe('2025-03-05');
  });
});

describe('formatEventTime', () => {
  it('renders midnight as 00:xx, not 24:xx', () => {
    const text = formatEventTime('2025-03-05T00:15:00Z', '2025-03-05T01:00:00Z', false, 'UTC');
    expect(text.startsWith('00:15')).toBe(true);
  });
});
