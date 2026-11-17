import { describe, it, expect } from 'vitest';
import { buildDayEmbeds, formatDayEvents } from '../src/bot/eventPages';
import { findCalendarColor, resolveCalendarColor } from '../src/calendarColors';
import type { CalendarEvent, UserCalendarConfig } from '../src/types';

const NOW = '2026-11-02T00:00:00.000Z';

function makeUser(calendars: UserCalendarConfig['calendars']): UserCalendarConfig {
  return {
    userId: 'u1',
    calendars,
    reminderMinutes: 10,
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeEvent(id: string, calendarId: string | undefined, hour: number): CalendarEvent {
  const start = new Date(`2026-11-03T${String(hour).padStart(2, '0')}:00:00.000Z`);
  return { id, title: `Event ${id}`, start, end: new Date(start.getTime() + 3_600_000), isAllDay: false, calendarId };
}

const heading = { author: { name: 'Schedule' }, title: 'Tuesday' };

describe('calendar colors', () => {
  it('resolves a known key and falls back to the default blue', () => {
    expect(findCalendarColor('tomato')?.hex).toBe('#d50000');
    expect(findCalendarColor('nope')).toBeUndefined();
    expect(resolveCalendarColor(undefined).key).toBe('peacock');
  });
});

describe('buildDayEmbeds', () => {
  const school = { id: 'a', name: 'School', url: 'x', addedAt: NOW, color: 'peacock' };
  const work = { id: 'b', name: 'Work', url: 'y', addedAt: NOW, color: 'tomato' };
  const gym = { id: 'c', name: 'Gym', url: 'z', addedAt: NOW, color: 'sage' };

  it('makes one embed per calendar with events, colored and in the user order', () => {
    const user = makeUser([work, school, gym]);
    const embeds = buildDayEmbeds([makeEvent('1', 'a', 9), makeEvent('2', 'b', 11), makeEvent('3', 'a', 13)], user, heading);

    expect(embeds).toHaveLength(2);
    expect(embeds[0]!.data.color).toBe(0xd50000);
    expect(embeds[0]!.data.description).toContain('Work');
    expect(embeds[1]!.data.color).toBe(0x039be5);
    expect(embeds[1]!.data.description).toContain('Event 1');
    expect(embeds[1]!.data.description).toContain('Event 3');
  });

  it('puts the heading only on the first embed', () => {
    const embeds = buildDayEmbeds([makeEvent('1', 'a', 9), makeEvent('2', 'b', 11)], makeUser([school, work]), heading);
    expect(embeds[0]!.data.title).toBe('Tuesday');
    expect(embeds[1]!.data.title).toBeUndefined();
  });

  it('groups events from unknown calendars under Other', () => {
    const embeds = buildDayEmbeds([makeEvent('1', 'gone', 9)], makeUser([school]), heading);
    expect(embeds).toHaveLength(1);
    expect(embeds[0]!.data.description).toContain('Other');
  });

  it('never exceeds Discord\'s 10 embeds per message', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `cal${i}`,
      name: `Cal ${i}`,
      url: String(i),
      addedAt: NOW,
    }));
    const events = many.map((cal, i) => makeEvent(String(i), cal.id, 8 + (i % 10)));
    expect(buildDayEmbeds(events, makeUser(many), heading).length).toBeLessThanOrEqual(10);
  });
});

describe('embed size limits', () => {
  const long = (ch: string) => ch.repeat(200);
  const bigEvent = (id: string, calendarId: string): CalendarEvent => ({
    ...makeEvent(id, calendarId, 9),
    title: long('t'),
    location: long('l'),
  });

  it('keeps one calendar with many long events under 4096 characters', () => {
    const cal = { id: 'a', name: 'School', url: 'x', addedAt: NOW };
    const events = Array.from({ length: 60 }, (_, i) => bigEvent(String(i), 'a'));
    const embeds = buildDayEmbeds(events, makeUser([cal]), heading);
    for (const embed of embeds) {
      expect(embed.data.description!.length).toBeLessThanOrEqual(4096);
    }
  });

  it('keeps the total across ten calendars under 6000 characters', () => {
    const cals = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, name: `Cal ${i}`, url: String(i), addedAt: NOW }));
    const events = cals.flatMap((cal) => Array.from({ length: 20 }, (_, i) => bigEvent(`${cal.id}-${i}`, cal.id)));
    const embeds = buildDayEmbeds(events, makeUser(cals), heading);
    const lengths = embeds.map((embed) => embed.data.description!.length);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(4096);
    expect(lengths.reduce((a, b) => a + b, 0)).toBeLessThan(6000);
  });
});

describe('formatDayEvents', () => {
  it('escapes masked links in titles and locations', () => {
    const text = '[Free gift](https://evil.example)';
    const event: CalendarEvent = { ...makeEvent('1', 'a', 9), title: text, location: text };
    const output = formatDayEvents([event], false);
    expect(output).toContain('Free gift');
    expect(output).not.toMatch(/(?<!\\)\[Free gift\]\(/);
    // Both the title and the location were escaped, not dropped.
    expect(output.match(/Free gift/g)).toHaveLength(2);
  });
});
