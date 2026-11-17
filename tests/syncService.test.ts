import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CalendarSyncService, describeFetchError } from '../src/calendar/syncService';
import type { CalendarEvent, LinkedCalendar } from '../src/types';

function codedError(code: string, message: string): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code });
}

describe('describeFetchError', () => {
  it('collapses an AggregateError of connection attempts into one line', () => {
    const aggregate = Object.assign(new AggregateError([
      codedError('ETIMEDOUT', 'connect ETIMEDOUT 142.251.34.238:443'),
      codedError('ENETUNREACH', 'connect ENETUNREACH 2607:f8b0:4009:81f::200e:443'),
    ]), { code: 'ETIMEDOUT' });

    const text = describeFetchError(aggregate);
    expect(text).toContain('ETIMEDOUT');
    expect(text).toContain('ENETUNREACH');
    expect(text).not.toContain('\n');
  });

  it('falls back to the message when there is no error code', () => {
    expect(describeFetchError(new Error('Failed to download calendar (HTTP status 500)'))).toBe(
      'Failed to download calendar (HTTP status 500)',
    );
  });
});

function ics(...events: string[][]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN'];
  for (const event of events) lines.push('BEGIN:VEVENT', ...event, 'END:VEVENT');
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

describe('CalendarSyncService.extractEvents', () => {
  it('keeps a multi-day all-day event that is still running', () => {
    const data = ics([
      'UID:trip',
      'DTSTART;VALUE=DATE:20261116',
      'DTEND;VALUE=DATE:20261121',
      'SUMMARY:Trip',
    ]);
    const events = CalendarSyncService.extractEvents(data, 7, 'Cal', new Date(2026, 10, 18, 12, 0));
    expect(events).toHaveLength(1);
    expect(events[0]!.title).toBe('Trip');
    expect(events[0]!.isAllDay).toBe(true);
  });

  it('keeps a 3-day timed event on its third day', () => {
    const data = ics([
      'UID:conf',
      'DTSTART:20261116T090000Z',
      'DTEND:20261119T170000Z',
      'SUMMARY:Conference',
    ]);
    const events = CalendarSyncService.extractEvents(data, 7, 'Cal', new Date('2026-11-18T12:00:00Z'));
    expect(events.map((e) => e.title)).toEqual(['Conference']);
  });

  it('drops an all-day event that ended two days ago', () => {
    const data = ics(['UID:old-day', 'DTSTART;VALUE=DATE:20261114', 'DTEND;VALUE=DATE:20261115', 'SUMMARY:Old all-day']);
    // All-day dates are local midnights, so `now` is built in local time too.
    expect(CalendarSyncService.extractEvents(data, 7, 'Cal', new Date(2026, 10, 18, 12, 0))).toEqual([]);
  });

  it('drops a timed event that ended an hour ago', () => {
    const data = ics(['UID:old-timed', 'DTSTART:20261118T090000Z', 'DTEND:20261118T110000Z', 'SUMMARY:Old timed']);
    expect(CalendarSyncService.extractEvents(data, 7, 'Cal', new Date('2026-11-18T12:00:00Z'))).toEqual([]);
  });

  it('caps a frequent recurring event at 100 upcoming occurrences', () => {
    const now = new Date('2026-11-16T12:00:00Z');
    const data = ics([
      'UID:often',
      'DTSTART:20261102T120000Z',
      'DTEND:20261102T120500Z',
      'RRULE:FREQ=MINUTELY;INTERVAL=10',
      'SUMMARY:Often',
    ]);
    const events = CalendarSyncService.extractEvents(data, 7, 'Cal', now);
    expect(events).toHaveLength(100);
    expect(events.every((e) => e.end.getTime() >= now.getTime())).toBe(true);
  });

  it('reaches well into the window for an hourly event that started earlier', () => {
    const now = new Date('2026-11-16T12:00:00Z');
    const data = ics([
      'UID:hourly',
      'DTSTART:20261102T120000Z',
      'DTEND:20261102T123000Z',
      'RRULE:FREQ=HOURLY',
      'SUMMARY:Hourly',
    ]);
    const events = CalendarSyncService.extractEvents(data, 7, 'Cal', now);
    const last = events[events.length - 1]!;
    expect(last.start.getTime() - now.getTime()).toBeGreaterThanOrEqual(4 * 24 * 60 * 60 * 1000);
  });

  it('applies EXDATE and RECURRENCE-ID overrides to a recurring event', () => {
    const now = new Date('2026-11-10T00:00:00Z');
    const data = ics(
      [
        'UID:daily',
        'DTSTART:20261102T100000Z',
        'DTEND:20261102T110000Z',
        'RRULE:FREQ=DAILY',
        'EXDATE:20261112T100000Z',
        'SUMMARY:Standup',
      ],
      [
        'UID:daily',
        'RECURRENCE-ID:20261113T100000Z',
        'DTSTART:20261113T150000Z',
        'DTEND:20261113T160000Z',
        'SUMMARY:Standup (moved)',
      ],
    );
    const events = CalendarSyncService.extractEvents(data, 7, 'Cal', now);
    const starts = events.map((e) => e.start.toISOString());

    expect(starts).not.toContain('2026-11-12T10:00:00.000Z');
    expect(starts).not.toContain('2026-11-13T10:00:00.000Z');
    const moved = events.find((e) => e.start.toISOString() === '2026-11-13T15:00:00.000Z');
    expect(moved?.title).toBe('Standup (moved)');
    expect(starts).toContain('2026-11-11T10:00:00.000Z');
    expect(starts).toContain('2026-11-14T10:00:00.000Z');
  });
});

describe('CalendarSyncService.fetchMultipleCalendars', () => {
  const NOW = Date.now();
  const calA: LinkedCalendar = { id: 'a', name: 'A', url: 'https://a.example/a.ics', addedAt: '' };
  const calB: LinkedCalendar = { id: 'b', name: 'B', url: 'https://b.example/b.ics', addedAt: '' };

  function event(id: string, calendarId: string | undefined, startOffsetMs: number): CalendarEvent {
    const start = new Date(NOW + startOffsetMs);
    return { id, title: id, start, end: new Date(start.getTime() + 3_600_000), isAllDay: false, calendarId };
  }

  function stubFeeds(feeds: Record<string, CalendarEvent[] | Error>) {
    return vi.spyOn(CalendarSyncService, 'fetchUpcomingEvents').mockImplementation(async (url) => {
      const result = feeds[url];
      if (result instanceof Error) throw result;
      return result ?? [];
    });
  }

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps the last known events of a calendar that failed with a network error', async () => {
    stubFeeds({
      [calA.url]: [event('a-new', 'a', 3_600_000)],
      [calB.url]: Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }),
    });
    const previous = [
      event('b-future', 'b', 7_200_000),
      event('b-ended', 'b', -7_200_000),
      event('a-stale', 'a', 10_800_000),
    ];

    const result = await CalendarSyncService.fetchMultipleCalendars([calA, calB], 7, previous);

    expect(result.hadTransientFailure).toBe(true);
    expect(result.events.map((e) => e.id).sort()).toEqual(['a-new', 'b-future']);
  });

  it('drops the events of a calendar that failed for another reason', async () => {
    stubFeeds({
      [calA.url]: [event('a-new', 'a', 3_600_000)],
      [calB.url]: new Error('Could not access the calendar.'),
    });
    const previous = [event('b-future', 'b', 7_200_000)];

    const result = await CalendarSyncService.fetchMultipleCalendars([calA, calB], 7, previous);

    expect(result.hadTransientFailure).toBe(false);
    expect(result.events.map((e) => e.id)).toEqual(['a-new']);
  });

  it('tags events with their calendar and sorts them by start time', async () => {
    stubFeeds({
      [calA.url]: [event('late', undefined, 5 * 3_600_000)],
      [calB.url]: [event('early', undefined, 3_600_000)],
    });

    const result = await CalendarSyncService.fetchMultipleCalendars([calA, calB]);

    expect(result.events.map((e) => [e.id, e.calendarId])).toEqual([
      ['early', 'b'],
      ['late', 'a'],
    ]);
  });
});
