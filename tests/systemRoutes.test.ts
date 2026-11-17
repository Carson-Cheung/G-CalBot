import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Runs before the imports below, so the storage singleton opens a throwaway file.
const tempDir = await vi.hoisted(async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcalbot-system-test-'));
  process.env.STORAGE_PATH = path.join(dir, 'database.json');
  delete process.env.DATABASE_BACKUP;
  return dir;
});

import fs from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { storage } from '../src/db/storage';
import { createServer } from '../src/server/app';
import { formatBotActivity } from '../src/bot/client';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = createServer();
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
    server.once('error', reject);
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeIdleConnections?.();
    });
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('GET /api/health', () => {
  it('returns userCount matching storage.getUserCount()', async () => {
    const userId = '200000000000000001';
    try {
      const res0 = await fetch(`${baseUrl}/api/health`);
      expect(res0.status).toBe(200);
      const body0 = (await res0.json()) as { status: string; storage: string; userCount: number };
      expect(body0.status).toBe('ok');
      expect(body0.userCount).toBe(0);
      expect(body0.userCount).toBe(storage.getUserCount());

      storage.addCalendar(userId, 'Primary', 'https://calendar.example/health1.ics');

      const res1 = await fetch(`${baseUrl}/api/health`);
      expect(res1.status).toBe(200);
      const body1 = (await res1.json()) as { status: string; storage: string; userCount: number };
      expect(body1.userCount).toBe(1);
      expect(body1.userCount).toBe(storage.getUserCount());
    } finally {
      storage.deleteUser(userId);
    }
  });
});

describe('GET /api/logs', () => {
  it('returns userCount matching storage.getUserCount() alongside { status, count, logs }', async () => {
    const userA = '200000000000000002';
    const userB = '200000000000000003';
    try {
      const res0 = await fetch(`${baseUrl}/api/logs`);
      expect(res0.status).toBe(200);
      const body0 = (await res0.json()) as {
        status: string;
        count: number;
        userCount: number;
        logs: unknown[];
      };
      expect(body0.status).toBe('ok');
      expect(Array.isArray(body0.logs)).toBe(true);
      expect(body0.count).toBe(body0.logs.length);
      expect(body0.userCount).toBe(0);
      expect(body0.userCount).toBe(storage.getUserCount());

      storage.addCalendar(userA, 'Primary', 'https://calendar.example/logs1.ics');
      storage.addCalendar(userB, 'Primary', 'https://calendar.example/logs2.ics');

      const res2 = await fetch(`${baseUrl}/api/logs`);
      expect(res2.status).toBe(200);
      const body2 = (await res2.json()) as {
        status: string;
        count: number;
        userCount: number;
        logs: unknown[];
      };
      expect(body2.status).toBe('ok');
      expect(Array.isArray(body2.logs)).toBe(true);
      expect(body2.count).toBe(body2.logs.length);
      expect(body2.userCount).toBe(2);
      expect(body2.userCount).toBe(storage.getUserCount());
    } finally {
      storage.deleteUser(userA);
      storage.deleteUser(userB);
    }
  });
});

describe('formatBotActivity', () => {
  it('formats singular and plural user counts', () => {
    expect(formatBotActivity(0)).toBe('/comms | 📅 0 users');
    expect(formatBotActivity(1)).toBe('/comms | 📅 1 user');
    expect(formatBotActivity(12)).toBe('/comms | 📅 12 users');
  });
});
