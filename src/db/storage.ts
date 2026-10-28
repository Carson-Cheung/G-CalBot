import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { config } from '../config';
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

function reminderKey(userId: string, eventId: string, leadMinutes: number): string {
  return `${userId}:${eventId}:${leadMinutes}`;
}

class Storage {
  private filePath: string;
  private data: DatabaseSchema = { users: {}, sentReminders: {} };
  private pool: Pool | null = null;
  private pgWriteChain: Promise<void> = Promise.resolve();

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
      await initPostgresSchema(pool);
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

  public async close(): Promise<void> {
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
   */
  private enqueuePgWrite(description: string, write: (pool: Pool) => Promise<void>) {
    const activePool = this.pool;
    if (!activePool) return;
    this.pgWriteChain = this.pgWriteChain
      .then(() => write(activePool))
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

  public addCalendar(
    userId: string,
    name: string,
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

    const newCal: LinkedCalendar = {
      id: `cal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: name || `Calendar ${user.calendars.length + 1}`,
      url,
      addedAt: now,
    };

    const existingIndex = user.calendars.findIndex((c) => c.url === url);
    if (existingIndex >= 0) {
      user.calendars[existingIndex] = newCal;
    } else {
      user.calendars.push(newCal);
    }

    user.updatedAt = now;
    this.saveUser(user);
    return newCal;
  }

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

    const target = identifier.toLowerCase();
    const initialLen = user.calendars.length;
    user.calendars = user.calendars.filter(
      (c) => c.id.toLowerCase() !== target && c.name.toLowerCase() !== target
    );
    if (user.calendars.length === initialLen) return false;

    if (user.calendars.length === 0) {
      delete user.icalUrl;
    } else {
      user.icalUrl = user.calendars[0].url;
    }
    user.updatedAt = new Date().toISOString();
    this.saveUser(user);
    return true;
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
