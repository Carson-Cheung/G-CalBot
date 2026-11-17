import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { config, MAX_CALENDARS_PER_USER } from '../config';
import { UserCalendarConfig, LinkedCalendar } from '../types';
import {
  createPostgresPool,
  initPostgresSchema,
  loadAllFromPostgres,
  upsertUserToPostgres,
  deleteUserFromPostgres,
  upsertReminderToPostgres,
  cleanupRemindersInPostgres,
} from './postgres';
import { DEMO_USER_ID, createDemoUser, normalizeUserCalendars } from './userDefaults';

interface DatabaseSchema {
  users: Record<string, UserCalendarConfig>;
  sentReminders: Record<string, number>; // key: `${userId}:${eventId}:${leadMinutes}` -> timestamp
}

const PG_CONNECT_ATTEMPTS = 3;
const PG_CONNECT_RETRY_MS = 2_000;
const PG_WRITE_ATTEMPTS = 3;
const PG_WRITE_RETRY_MS = 500;

function reminderKey(userId: string, eventId: string, leadMinutes: number): string {
  return `${userId}:${eventId}:${leadMinutes}`;
}

// Bad data, constraint violations and syntax errors (SQLSTATE classes 22, 23 and 42)
// fail the same way every time, so only other errors, such as a dropped connection, are retried.
const PERMANENT_SQL_ERROR = /^(22|23|42)[0-9A-Z]{3}$/;

function isPermanentSqlError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && PERMANENT_SQL_ERROR.test(code);
}

/** Runs a database call that is safe to repeat, pausing a little longer after each failure. */
async function withRetry<T>(run: () => Promise<T>, attempts: number, delayMs: number): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (attempt >= attempts || isPermanentSqlError(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
}

class Storage {
  private filePath: string;
  private data: DatabaseSchema = { users: {}, sentReminders: {} };
  private pool: Pool | null = null;
  private pgWriteChain: Promise<void> = Promise.resolve();
  private closing: Promise<void> | null = null;

  constructor() {
    this.filePath = config.storagePath;
    this.loadLocalFile();
    this.mergeEnvBackup();
    this.ensureDemoUser();
  }

  private ensureDemoUser(): UserCalendarConfig {
    const existing = this.data.users[DEMO_USER_ID];
    if (!existing || !existing.calendars || existing.calendars.length === 0) {
      const demoUser = createDemoUser();
      this.data.users[DEMO_USER_ID] = demoUser;
      return demoUser;
    }
    return existing;
  }

  private loadLocalFile() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(this.filePath)) {
      this.persist();
      return;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      this.data = {
        users: parsed.users || {},
        sentReminders: parsed.sentReminders || {},
      };
      Object.values(this.data.users).forEach(normalizeUserCalendars);
    } catch (err) {
      console.error('Failed to parse database file, preserving backup:', err);
      try {
        fs.copyFileSync(this.filePath, `${this.filePath}.corrupt.${Date.now()}`);
      } catch {}
      this.persist();
    }
  }

  private mergeEnvBackup() {
    const backupRaw = process.env.DATABASE_BACKUP?.trim();
    if (!backupRaw) return;

    try {
      const parsedBackup = JSON.parse(backupRaw);
      if (!parsedBackup || typeof parsedBackup !== 'object') return;

      const backupUsers: Record<string, UserCalendarConfig> =
        parsedBackup.users || parsedBackup;
      let restoredCount = 0;

      for (const [userId, uConfig] of Object.entries(backupUsers)) {
        if (!this.data.users[userId]) {
          this.data.users[userId] = normalizeUserCalendars(uConfig);
          restoredCount++;
        }
      }

      if (parsedBackup.sentReminders) {
        this.data.sentReminders = {
          ...parsedBackup.sentReminders,
          ...this.data.sentReminders,
        };
      }

      if (restoredCount > 0) {
        console.log(
          `✅ Restored/Merged ${restoredCount} user(s) from DATABASE_BACKUP environment variable! (Total: ${Object.keys(this.data.users).length})`
        );
        this.persist();
      }
    } catch (err) {
      console.error('Failed to parse DATABASE_BACKUP environment variable:', err);
    }
  }

  /**
   * Initializes database connection to Neon PostgreSQL if DATABASE_URL is configured.
   * Migrates and merges any local users into Neon PostgreSQL.
   */
  public async initDatabase(): Promise<void> {
    this.ensureDemoUser();
    if (!config.databaseUrl) {
      console.log(
        '📦 Local JSON database active. Set DATABASE_URL in .env to connect to Neon PostgreSQL.'
      );
      return;
    }

    const pool = createPostgresPool(config.databaseUrl);
    try {
      // A serverless database can take a few seconds to wake, and falling back to the
      // local file would hide every user's calendars until the next restart.
      await withRetry(() => initPostgresSchema(pool), PG_CONNECT_ATTEMPTS, PG_CONNECT_RETRY_MS);
      const pgData = await loadAllFromPostgres(pool);
      const localUsers = { ...this.data.users };

      for (const [userId, localUser] of Object.entries(localUsers)) {
        const pgUser = pgData.users[userId];
        if (!pgUser) {
          await upsertUserToPostgres(pool, localUser);
          pgData.users[userId] = localUser;
          continue;
        }
        const pgUrls = new Set(pgUser.calendars.map((c) => c.url));
        const missingCalendars = (localUser.calendars || []).filter(
          (c) => !pgUrls.has(c.url)
        );
        if (missingCalendars.length > 0) {
          const mergedUser: UserCalendarConfig = {
            ...pgUser,
            calendars: [...pgUser.calendars, ...missingCalendars],
            updatedAt: new Date().toISOString(),
          };
          await upsertUserToPostgres(pool, mergedUser);
          pgData.users[userId] = mergedUser;
        }
      }

      this.data.users = { ...localUsers, ...pgData.users };
      this.data.sentReminders = {
        ...this.data.sentReminders,
        ...pgData.sentReminders,
      };
      this.persist();
      this.pool = pool;

      console.log(
        `🐘 Connected to Neon PostgreSQL database (${Object.keys(this.data.users).length} users loaded/migrated)`
      );
    } catch (err) {
      console.error('❌ Failed to connect to Neon PostgreSQL database:', err);
      console.log('📦 Falling back to local JSON database.');
      await pool.end().catch(() => {});
    }
  }

  public isPostgresConnected(): boolean {
    return this.pool !== null;
  }

  /** Safe to call more than once: later callers wait for the same shutdown. */
  public close(): Promise<void> {
    this.closing ??= this.closePool();
    return this.closing;
  }

  private async closePool(): Promise<void> {
    if (!this.pool) return;
    const activePool = this.pool;
    this.pool = null;
    // Let queued writes land before the pool goes away.
    await this.pgWriteChain;
    await activePool.end();
    console.log('🔌 Neon PostgreSQL connection pool closed.');
  }

  public getBackup(): DatabaseSchema {
    return {
      users: { ...this.data.users },
      sentReminders: { ...this.data.sentReminders },
    };
  }

  private persist() {
    try {
      const tempPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error('Failed to persist database:', err);
    }
  }

  /**
   * Serializes Postgres writes so a delete can never be overtaken by an
   * earlier upsert for the same user (which would resurrect the row).
   * Every write is an upsert or a delete, so a failed one is simply tried again.
   */
  private enqueuePgWrite(description: string, write: (pool: Pool) => Promise<void>) {
    const activePool = this.pool;
    if (!activePool) return;
    this.pgWriteChain = this.pgWriteChain
      .then(() => withRetry(() => write(activePool), PG_WRITE_ATTEMPTS, PG_WRITE_RETRY_MS))
      .catch((err) => {
        console.error(`Failed to ${description} in Neon PostgreSQL:`, err);
      });
  }

  public getUser(userId: string): UserCalendarConfig | undefined {
    if (userId === DEMO_USER_ID) {
      return this.ensureDemoUser();
    }
    const user = this.data.users[userId];
    return user ? normalizeUserCalendars(user) : undefined;
  }

  public getAllUsers(): UserCalendarConfig[] {
    return Object.values(this.data.users).map(normalizeUserCalendars);
  }

  public saveUser(user: UserCalendarConfig): void {
    normalizeUserCalendars(user);
    this.data.users[user.userId] = user;
    this.persist();
    this.enqueuePgWrite(`sync user ${user.userId}`, (pool) =>
      upsertUserToPostgres(pool, user)
    );
  }

  /** Removes everything stored about a user: settings, calendars and sent-reminder records. */
  public deleteUser(userId: string): boolean {
    const prefix = `${userId}:`;
    const reminderKeys = Object.keys(this.data.sentReminders).filter((key) => key.startsWith(prefix));
    if (!this.data.users[userId] && reminderKeys.length === 0) return false;

    delete this.data.users[userId];
    for (const key of reminderKeys) delete this.data.sentReminders[key];
    this.persist();
    this.enqueuePgWrite(`delete user ${userId}`, (pool) =>
      deleteUserFromPostgres(pool, userId)
    );
    return true;
  }

  /** True when linking `url` would put the user over the limit. Re-linking a URL they already have never does. */
  public isAtCalendarLimit(userId: string, url: string): boolean {
    const calendars = this.getUser(userId)?.calendars ?? [];
    return calendars.length >= MAX_CALENDARS_PER_USER && !calendars.some((c) => c.url === url);
  }

  /**
   * Why `name` cannot be used for the calendar at `url`, or null when it is fine.
   * Commands address calendars by name, so names are unique per user.
   */
  public calendarNameProblem(userId: string, name: string, url: string): string | null {
    const target = name.trim().toLowerCase();
    if (target === 'all') return 'The name "all" is reserved. Please choose another name.';
    const taken = this.getUser(userId)?.calendars.some(
      (c) => c.url !== url && c.name.toLowerCase() === target
    );
    return taken ? 'You already have a calendar with that name. Please choose another name.' : null;
  }

  /** "Primary" for the first calendar, then the first unused "Calendar N". */
  private defaultCalendarName(calendars: LinkedCalendar[]): string {
    if (calendars.length === 0) return 'Primary';
    const names = new Set(calendars.map((c) => c.name.toLowerCase()));
    let n = calendars.length + 1;
    while (names.has(`calendar ${n}`)) n++;
    return `Calendar ${n}`;
  }

  /**
   * Links a calendar. Linking a URL the user already has renames that calendar
   * (when a name is given) and keeps its ID, colour and position.
   */
  public addCalendar(
    userId: string,
    name: string | undefined,
    url: string,
    reminderMinutes = 10
  ): LinkedCalendar {
    const now = new Date().toISOString();
    const user: UserCalendarConfig = this.getUser(userId) ?? {
      userId,
      calendars: [],
      reminderMinutes,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };

    const existingIndex = user.calendars.findIndex((c) => c.url === url);
    let calendar: LinkedCalendar;
    if (existingIndex >= 0) {
      const existing = user.calendars[existingIndex]!;
      calendar = { ...existing, name: name || existing.name };
      user.calendars[existingIndex] = calendar;
    } else {
      calendar = {
        id: `cal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: name || this.defaultCalendarName(user.calendars),
        url,
        addedAt: now,
      };
      user.calendars.push(calendar);
    }

    user.updatedAt = now;
    this.saveUser(user);
    return calendar;
  }

  /** Removes one calendar by ID or name, or every calendar when no identifier (or "all") is given. */
  public removeCalendar(userId: string, identifier?: string): boolean {
    const user = this.getUser(userId);
    if (!user || user.calendars.length === 0) return false;

    if (!identifier || identifier.toLowerCase() === 'all') {
      user.calendars = [];
      delete user.icalUrl;
      user.updatedAt = new Date().toISOString();
      this.saveUser(user);
      return true;
    }

    const target = this.findCalendar(user, identifier);
    if (!target) return false;
    user.calendars = user.calendars.filter((c) => c !== target);

    if (user.calendars.length === 0) {
      delete user.icalUrl;
    } else {
      user.icalUrl = user.calendars[0].url;
    }
    user.updatedAt = new Date().toISOString();
    this.saveUser(user);
    return true;
  }

  /** Finds a linked calendar by ID or name (case-insensitive). */
  public findCalendar(user: UserCalendarConfig, identifier: string): LinkedCalendar | undefined {
    const target = identifier.trim().toLowerCase();
    return user.calendars.find((c) => c.id.toLowerCase() === target || c.name.toLowerCase() === target);
  }

  public setCalendarColor(userId: string, identifier: string, color: string): LinkedCalendar | undefined {
    const user = this.getUser(userId);
    const calendar = user && this.findCalendar(user, identifier);
    if (!user || !calendar) return undefined;
    calendar.color = color;
    user.updatedAt = new Date().toISOString();
    this.saveUser(user);
    return calendar;
  }

  /** Moves a calendar to the front of the user's list, which is the group shown first. */
  public moveCalendarToTop(userId: string, identifier: string): LinkedCalendar | undefined {
    const user = this.getUser(userId);
    const calendar = user && this.findCalendar(user, identifier);
    if (!user || !calendar) return undefined;
    user.calendars = [calendar, ...user.calendars.filter((c) => c !== calendar)];
    user.icalUrl = user.calendars[0]!.url;
    user.updatedAt = new Date().toISOString();
    this.saveUser(user);
    return calendar;
  }

  public hasReminderBeenSent(
    userId: string,
    eventId: string,
    leadMinutes: number
  ): boolean {
    return Boolean(this.data.sentReminders[reminderKey(userId, eventId, leadMinutes)]);
  }

  public markReminderSent(
    userId: string,
    eventId: string,
    leadMinutes: number
  ): void {
    const key = reminderKey(userId, eventId, leadMinutes);
    const now = Date.now();
    this.data.sentReminders[key] = now;
    this.persist();
    this.enqueuePgWrite(`record sent reminder ${key}`, (pool) =>
      upsertReminderToPostgres(pool, key, now)
    );
  }

  public cleanupOldReminders(daysToKeep = 7): void {
    const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    let changed = false;
    for (const [key, timestamp] of Object.entries(this.data.sentReminders)) {
      if (timestamp < cutoff) {
        delete this.data.sentReminders[key];
        changed = true;
      }
    }
    if (changed) {
      this.persist();
    }
    this.enqueuePgWrite('clean up old reminders', (pool) =>
      cleanupRemindersInPostgres(pool, cutoff)
    );
  }
}

export const storage = new Storage();
export default storage;
