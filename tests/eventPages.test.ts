import { describe, it, expect } from 'vitest';
import { buildDayEmbeds } from '../src/bot/eventPages';
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
