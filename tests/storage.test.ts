import { describe, it, expect, afterAll, vi } from 'vitest';

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
import path from 'path';
import { config, MAX_CALENDARS_PER_USER } from '../src/config';
import { storage } from '../src/db/storage';
import { DEMO_USER_ID } from '../src/db/userDefaults';
import type { UserCalendarConfig } from '../src/types';

const NOW = '2026-11-02T00:00:00.000Z';

function urlFor(n: number): string {
  return `https://calendar.example/feed${n}.ics`;
}

function namesOf(userId: string): string[] {
  return storage.getUser(userId)!.calendars.map((c) => c.name);
}

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('storage test setup', () => {
  it('uses the throwaway data file', () => {
    expect(config.storagePath).toBe(path.join(tempDir, 'database.json'));
    expect(fs.existsSync(config.storagePath)).toBe(true);
  });
});

describe('getUserCount', () => {
  it('excludes demo-user, starts at 0, and updates on real user adds, updates, and deletes', () => {
    const userA = '100000000000000091';
    const userB = '100000000000000092';

    try {
      expect(DEMO_USER_ID).toBe('demo-user');
      expect(storage.getUser(DEMO_USER_ID)).toBeDefined();
      expect(storage.getUserCount()).toBe(0);

      storage.addCalendar(userA, 'Work', urlFor(1));
      expect(storage.getUserCount()).toBe(1);

      // Updating an existing user should not change the count.
      storage.addCalendar(userA, 'Personal', urlFor(2));
      const existing = storage.getUser(userA)!;
      storage.saveUser({ ...existing, updatedAt: NOW });
      expect(storage.getUserCount()).toBe(1);

      // Saving demo-user should not change the count.
      const demo = storage.getUser(DEMO_USER_ID)!;
      storage.saveUser({ ...demo, updatedAt: NOW });
      expect(storage.getUserCount()).toBe(1);

      storage.addCalendar(userB, 'School', urlFor(3));
      expect(storage.getUserCount()).toBe(2);

      expect(storage.deleteUser(userA)).toBe(true);
      expect(storage.getUserCount()).toBe(1);

      expect(storage.deleteUser(userA)).toBe(false);
      expect(storage.getUserCount()).toBe(1);

      expect(storage.deleteUser(userB)).toBe(true);
      expect(storage.getUserCount()).toBe(0);
    } finally {
      storage.deleteUser(userA);
      storage.deleteUser(userB);
    }
  });
});

describe('onUserCountChange', () => {
  it('fires only when the real user count changes and stops after unsubscribe', () => {
    const userA = '100000000000000093';
    const userB = '100000000000000094';
    const userC = '100000000000000095';
    const counts: number[] = [];
    const unsubscribe = storage.onUserCountChange((count) => counts.push(count));

    try {
      storage.addCalendar(userA, 'Primary', urlFor(1));
      expect(counts).toEqual([1]);

      // Updating existing user or saving demo-user does not fire the listener.
      storage.addCalendar(userA, 'Extra', urlFor(2));
      const demo = storage.getUser(DEMO_USER_ID)!;
      storage.saveUser({ ...demo, updatedAt: NOW });
      expect(counts).toEqual([1]);

      storage.addCalendar(userB, 'Primary', urlFor(3));
      expect(counts).toEqual([1, 2]);

      storage.deleteUser(userA);
      expect(counts).toEqual([1, 2, 1]);

      // Deleting an already-absent user does not fire the listener.
      storage.deleteUser(userA);
      expect(counts).toEqual([1, 2, 1]);

      unsubscribe();

      storage.deleteUser(userB);
      storage.addCalendar(userC, 'Primary', urlFor(4));
      expect(counts).toEqual([1, 2, 1]);
    } finally {
      unsubscribe();
      storage.deleteUser(userA);
      storage.deleteUser(userB);
      storage.deleteUser(userC);
    }
  });

  it('catches per-listener errors so persistence and other listeners still succeed', () => {
    const userId = '100000000000000096';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const seen: number[] = [];
    const unsubBad = storage.onUserCountChange(() => {
      throw new Error('listener boom');
    });
    const unsubGood = storage.onUserCountChange((count) => seen.push(count));

    try {
      storage.addCalendar(userId, 'Primary', urlFor(1));
      expect(seen).toEqual([1]);
      const persisted = JSON.parse(fs.readFileSync(config.storagePath, 'utf-8'));
      expect(persisted.users[userId]).toBeDefined();
    } finally {
      unsubBad();
      unsubGood();
      storage.deleteUser(userId);
      errorSpy.mockRestore();
    }
  });
});

describe('addCalendar', () => {
  it('names calendars Primary, then Calendar 2, and never repeats a name', () => {
    const userId = '100000000000000001';
    storage.addCalendar(userId, undefined, urlFor(1));
    storage.addCalendar(userId, undefined, urlFor(2));
    expect(namesOf(userId)).toEqual(['Primary', 'Calendar 2']);

    storage.removeCalendar(userId, 'Primary');
    const third = storage.addCalendar(userId, undefined, urlFor(3));
    const others = namesOf(userId).filter((name) => name !== third.name);
    expect(others.map((n) => n.toLowerCase())).not.toContain(third.name.toLowerCase());
  });

  it('keeps id, colour, position and name when a URL is linked again', () => {
    const userId = '100000000000000002';
    const first = storage.addCalendar(userId, 'School', urlFor(1));
    storage.addCalendar(userId, 'Work', urlFor(2));
    storage.setCalendarColor(userId, 'School', 'tomato');

    const again = storage.addCalendar(userId, undefined, urlFor(1));
    let user = storage.getUser(userId)!;
    expect(again.id).toBe(first.id);
    expect(user.calendars).toHaveLength(2);
    expect(user.calendars[0]).toMatchObject({ id: first.id, name: 'School', color: 'tomato' });

    storage.addCalendar(userId, 'Classes', urlFor(1));
    user = storage.getUser(userId)!;
    expect(user.calendars).toHaveLength(2);
    expect(user.calendars[0]).toMatchObject({ id: first.id, name: 'Classes', color: 'tomato', url: urlFor(1) });
  });
});

describe('removeCalendar', () => {
  it('removes only one calendar when two share a name', () => {
    const userId = '100000000000000003';
    const user: UserCalendarConfig = {
      userId,
      calendars: [
        { id: 'one', name: 'Dup', url: urlFor(1), addedAt: NOW },
        { id: 'two', name: 'Dup', url: urlFor(2), addedAt: NOW },
      ],
      reminderMinutes: 10,
      enabled: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    storage.saveUser(user);

    expect(storage.removeCalendar(userId, 'Dup')).toBe(true);
    expect(storage.getUser(userId)!.calendars).toHaveLength(1);
  });

  it('removes every calendar when no name or "all" is given', () => {
    const userId = '100000000000000004';
    storage.addCalendar(userId, 'A', urlFor(1));
    storage.addCalendar(userId, 'B', urlFor(2));
    expect(storage.removeCalendar(userId)).toBe(true);
    expect(storage.getUser(userId)!.calendars).toEqual([]);

    storage.addCalendar(userId, 'A', urlFor(1));
    storage.addCalendar(userId, 'B', urlFor(2));
    expect(storage.removeCalendar(userId, 'ALL')).toBe(true);
    expect(storage.getUser(userId)!.calendars).toEqual([]);
  });
});

describe('calendarNameProblem', () => {
  const userId = '100000000000000005';

  it('rejects reserved and duplicate names but allows reuse for the same URL', () => {
    storage.addCalendar(userId, 'School', urlFor(1));

    expect(storage.calendarNameProblem(userId, 'all', urlFor(2))).toBeTruthy();
    expect(storage.calendarNameProblem(userId, 'ALL', urlFor(2))).toBeTruthy();
    expect(storage.calendarNameProblem(userId, 'school', urlFor(2))).toBeTruthy();
    expect(storage.calendarNameProblem(userId, 'School', urlFor(1))).toBeNull();
    expect(storage.calendarNameProblem(userId, 'Gym', urlFor(2))).toBeNull();
  });
});

describe('isAtCalendarLimit', () => {
  it('is true only for a new URL once the limit is reached', () => {
    const userId = '100000000000000006';
    for (let i = 1; i < MAX_CALENDARS_PER_USER; i++) storage.addCalendar(userId, undefined, urlFor(i));
    expect(storage.isAtCalendarLimit(userId, urlFor(100))).toBe(false);

    storage.addCalendar(userId, undefined, urlFor(MAX_CALENDARS_PER_USER));
    expect(storage.getUser(userId)!.calendars).toHaveLength(MAX_CALENDARS_PER_USER);
    expect(storage.isAtCalendarLimit(userId, urlFor(100))).toBe(true);
    expect(storage.isAtCalendarLimit(userId, urlFor(1))).toBe(false);
  });
});

describe('deleteUser', () => {
  it('removes the user once and then reports nothing to delete', () => {
    const userId = '100000000000000007';
    storage.addCalendar(userId, 'A', urlFor(1));

    expect(storage.deleteUser(userId)).toBe(true);
    expect(storage.getUser(userId)).toBeUndefined();
    expect(storage.deleteUser(userId)).toBe(false);
  });
});
