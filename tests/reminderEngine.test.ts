import { describe, it, expect, afterAll, beforeEach, afterEach, vi } from 'vitest';

// Runs before the imports below, so the storage singleton opens a throwaway file.
const tempDir = await vi.hoisted(async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcalbot-test-'));
  process.env.STORAGE_PATH = path.join(dir, 'database.json');
  delete process.env.DATABASE_BACKUP;
  return dir;
});

import fs from 'fs';
import type { Client } from 'discord.js';
import { ReminderEngine } from '../src/calendar/reminderEngine';
import { CalendarSyncService } from '../src/calendar/syncService';
import { storage } from '../src/db/storage';
import type { CalendarEvent, UserCalendarConfig } from '../src/types';

const NOW = '2026-11-02T00:00:00.000Z';

function makeUser(userId: string, extra: Partial<UserCalendarConfig> = {}): UserCalendarConfig {
  return {
    userId,
    calendars: [{ id: 'cal1', name: 'Primary', url: 'https://calendar.example/feed.ics', addedAt: NOW }],
    reminderMinutes: 10,
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

function makeEvent(id: string): CalendarEvent {
  const start = new Date('2026-11-16T15:00:00Z');
  return { id, title: id, start, end: new Date(start.getTime() + 3_600_000), isAllDay: false, calendarId: 'cal1' };
}

function makeEngine(client: object = {}): ReminderEngine {
  return new ReminderEngine(client as unknown as Client);
}

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('ReminderEngine.getUserEvents', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
    fetchSpy = vi
      .spyOn(CalendarSyncService, 'fetchMultipleCalendars')
      .mockResolvedValue({ events: [makeEvent('e1')], hadTransientFailure: false });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('serves a second call from the cache unless a refresh is forced', async () => {
    const engine = makeEngine();
    const user = makeUser('100000000000000011');

    await engine.getUserEvents(user);
    await engine.getUserEvents(user);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await engine.getUserEvents(user, true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('retries after a transient failure but not after a clean result', async () => {
    const engine = makeEngine();
    const user = makeUser('100000000000000012');

    fetchSpy.mockResolvedValueOnce({ events: [makeEvent('e1')], hadTransientFailure: true });
    await engine.getUserEvents(user);
    vi.setSystemTime(Date.now() + 61_000);
    await engine.getUserEvents(user);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // The second result was clean, so another 61 seconds later it is still cached.
    vi.setSystemTime(Date.now() + 61_000);
    await engine.getUserEvents(user);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('caches a wider window without replacing the default one', async () => {
    const engine = makeEngine();
    const user = makeUser('100000000000000013');

    await engine.getUserEvents(user);
    await engine.getUserEvents(user, false, 14);
    await engine.getUserEvents(user, false, 14);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await engine.getUserEvents(user);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('refetches both windows after the cache is invalidated', async () => {
    const engine = makeEngine();
    const user = makeUser('100000000000000014');

    await engine.getUserEvents(user);
    await engine.getUserEvents(user, false, 14);
    engine.invalidateUserCache(user.userId);
    await engine.getUserEvents(user);
    await engine.getUserEvents(user, false, 14);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it('keeps the old events as the fallback when the cache is invalidated', async () => {
    const engine = makeEngine();
    const user = makeUser('100000000000000016');
    const events = [makeEvent('kept')];

    fetchSpy.mockResolvedValueOnce({ events, hadTransientFailure: false });
    await engine.getUserEvents(user);
    engine.invalidateUserCache(user.userId);
    await engine.getUserEvents(user);

    expect(fetchSpy.mock.calls[1]![2]).toBe(events);
  });

  it('holds nothing for a forgotten user', async () => {
    const engine = makeEngine();
    const user = makeUser('100000000000000017');

    await engine.getUserEvents(user);
    engine.forgetUser(user.userId);
    await engine.getUserEvents(user);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1]![2]).toBeUndefined();
  });

  it('gives up on a feed that has failed for over an hour', async () => {
    const engine = makeEngine();
    const user = makeUser('100000000000000018');
    fetchSpy.mockResolvedValue({ events: [makeEvent('stale')], hadTransientFailure: true });

    await engine.getUserEvents(user);
    vi.setSystemTime(Date.now() + 61 * 60_000);
    await engine.getUserEvents(user);
    // Past the limit the last known events are no longer offered as a fallback...
    expect(fetchSpy.mock.calls[1]![2]).toBeUndefined();

    // ...and the next check waits out the normal cache time instead of retrying each minute.
    vi.setSystemTime(Date.now() + 61_000);
    await engine.getUserEvents(user);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('passes the cached events of the same window as the previous result', async () => {
    const engine = makeEngine();
    const user = makeUser('100000000000000015');
    const defaultEvents = [makeEvent('seven')];
    const wideEvents = [makeEvent('fourteen')];

    fetchSpy.mockResolvedValueOnce({ events: defaultEvents, hadTransientFailure: false });
    await engine.getUserEvents(user);
    fetchSpy.mockResolvedValueOnce({ events: wideEvents, hadTransientFailure: false });
    await engine.getUserEvents(user, false, 14);

    await engine.getUserEvents(user, true);
    await engine.getUserEvents(user, true, 14);

    expect(fetchSpy.mock.calls[0]![2]).toBeUndefined();
    expect(fetchSpy.mock.calls[1]![2]).toBeUndefined();
    expect(fetchSpy.mock.calls[2]![2]).toBe(defaultEvents);
    expect(fetchSpy.mock.calls[3]![2]).toBe(wideEvents);
  });
});

describe('ReminderEngine daily digest', () => {
  function setup(userId: string, send: ReturnType<typeof vi.fn>) {
    const discordUser = {
      send,
      displayName: 'T',
      username: 't',
      displayAvatarURL: () => 'https://example.com/a.png',
    };
    const client = { users: { fetch: vi.fn().mockResolvedValue(discordUser) } };
    const engine = makeEngine(client);
    storage.saveUser(
      makeUser(userId, { dailyDigestEnabled: true, dailyDigestTime: '00:00', timezone: 'UTC' })
    );
    const run = () => (engine as any).checkUserDailyDigest(storage.getUser(userId)) as Promise<void>;
    return { run };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
    vi.spyOn(CalendarSyncService, 'fetchMultipleCalendars').mockResolvedValue({
      events: [],
      hadTransientFailure: false,
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends once a day and records that it did', async () => {
    const userId = '100000000000000021';
    const send = vi.fn().mockResolvedValue(undefined);
    const { run } = setup(userId, send);

    await run();
    expect(send).toHaveBeenCalledTimes(1);
    expect(storage.getUser(userId)!.lastDailyDigestDate).toBe('2026-11-16');

    await run();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('counts a digest that can never be delivered as done for the day', async () => {
    const userId = '100000000000000022';
    const send = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Cannot send messages to this user'), { code: 50007 }));
    const { run } = setup(userId, send);

    await run();
    expect(send).toHaveBeenCalledTimes(1);
    expect(storage.getUser(userId)!.lastDailyDigestDate).toBe('2026-11-16');
  });

  it('leaves the day open to a retry after any other failure', async () => {
    const userId = '100000000000000023';
    const send = vi.fn().mockRejectedValue(new Error('boom'));
    const { run } = setup(userId, send);

    await run();
    expect(storage.getUser(userId)!.lastDailyDigestDate).toBeUndefined();
  });

  it('does not save a user back after they deleted their data mid-send', async () => {
    const userId = '100000000000000024';
    const send = vi.fn().mockImplementation(async () => {
      storage.deleteUser(userId);
    });
    const { run } = setup(userId, send);

    await run();
    expect(send).toHaveBeenCalledTimes(1);
    expect(storage.getUser(userId)).toBeUndefined();
  });
});
