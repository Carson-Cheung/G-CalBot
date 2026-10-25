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

interface DatabaseSchema {
  users: Record<string, UserCalendarConfig>;
  sentReminders: Record<string, number>; // key: `${userId}:${eventId}:${leadMinutes}` -> timestamp
}

class Storage {
  private filePath: string;
  private data: DatabaseSchema;
  private pool: Pool | null = null;
  private lastActiveUserId: string | null = null;

  public setLastActiveUser(userId: string): void {
    if (userId) {
      this.lastActiveUserId = userId;
    }
  }

  public getLastActiveUser(): string | null {
    return this.lastActiveUserId;
  }

  private getDefaultDemoUser(): UserCalendarConfig {
    return {
      userId: 'demo-user',
      reminderMinutes: 10,
      enabled: true,
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
      calendars: [
        {
          id: 'demo_cal_f1',
          name: 'Formula 1 Schedule (Demo)',
          url: 'https://f1calendar.com/download/f1-calendar_p1_p2_p3_qualifying_sprint_gp.ics',
          addedAt: '2026-10-20T00:00:00.000Z',
        },
        {
          id: 'demo_cal_holidays',
          name: 'Canadian Holidays (Demo)',
          url: 'https://calendar.google.com/calendar/ical/en.canadian%23holiday%40group.v.calendar.google.com/public/basic.ics',
          addedAt: '2026-10-20T00:00:00.000Z',
        },
      ],
    };
  }

  private ensureDemoUser(): UserCalendarConfig {
    const existing = this.data.users['demo-user'];
    if (!existing || !existing.calendars || existing.calendars.length === 0) {
      const demoUser = this.getDefaultDemoUser();
      this.data.users['demo-user'] = demoUser;
      return demoUser;
    }
    return existing;
  }

  constructor() {
    this.filePath = config.storagePath;
    this.data = {
      users: {},
      sentReminders: {},
    };
    this.init();
  }

  private init() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = {
          users: parsed.users || {},
          sentReminders: parsed.sentReminders || {},
        };

        // Normalize backward compatibility for users
        for (const user of Object.values(this.data.users)) {
          if (!user.calendars) {
            user.calendars = [];
            if (user.icalUrl) {
              user.calendars.push({
                id: 'primary',
                name: 'Primary',
                url: user.icalUrl,
                addedAt: user.createdAt || new Date().toISOString(),
              });
            }
          }
        }
      } catch (err) {
        console.error('Failed to parse database file, preserving backup:', err);
        try {
          fs.copyFileSync(this.filePath, `${this.filePath}.corrupt.${Date.now()}`);
        } catch {}
        this.persist();
      }
    } else {
      this.persist();
    }

    // Auto-restore / merge from DATABASE_BACKUP environment variable
    if (process.env.DATABASE_BACKUP) {
      try {
        const backupRaw = process.env.DATABASE_BACKUP.trim();
        const parsedBackup = JSON.parse(backupRaw);
        if (parsedBackup && typeof parsedBackup === 'object') {
          const backupUsers: Record<string, UserCalendarConfig> =
            parsedBackup.users || parsedBackup;
          let restoredCount = 0;

          for (const [userId, uConfig] of Object.entries(backupUsers)) {
            if (!this.data.users[userId]) {
              this.data.users[userId] = uConfig;
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
        }
      } catch (bErr) {
        console.error('Failed to parse DATABASE_BACKUP environment variable:', bErr);
      }
    }

    this.ensureDemoUser();
  }

  /**
   * Initializes database connection to Neon PostgreSQL if DATABASE_URL is configured.
   * Migrates and merges any local users into Neon PostgreSQL.
   */
  public async initDatabase(): Promise<void> {
    this.ensureDemoUser();
    if (config.databaseUrl) {
      try {
        this.pool = createPostgresPool(config.databaseUrl);
        await initPostgresSchema(this.pool);
        const pgData = await loadAllFromPostgres(this.pool);

        // Collect all local users to ensure nothing is lost
        const localUsers: Record<string, UserCalendarConfig> = {
          ...this.data.users,
        };

        // Migrate local users into Neon PostgreSQL if missing or missing calendars
        for (const [userId, localUser] of Object.entries(localUsers)) {
          const pgUser = pgData.users[userId];
          if (!pgUser) {
            await upsertUserToPostgres(this.pool, localUser);
            pgData.users[userId] = localUser;
          } else {
            const pgUrls = new Set((pgUser.calendars || []).map((c) => c.url));
            const missingCalendars = (localUser.calendars || []).filter(
              (c) => !pgUrls.has(c.url)
            );
            if (missingCalendars.length > 0) {
              const mergedUser: UserCalendarConfig = {
                ...pgUser,
                calendars: [...(pgUser.calendars || []), ...missingCalendars],
                updatedAt: new Date().toISOString(),
              };
              await upsertUserToPostgres(this.pool, mergedUser);
              pgData.users[userId] = mergedUser;
            }
          }
        }

        // Synchronize in-memory state with PostgreSQL state
        this.data.users = { ...localUsers, ...pgData.users };
        this.data.sentReminders = {
          ...this.data.sentReminders,
          ...pgData.sentReminders,
        };
        this.persist();

        console.log(
          `🐘 Connected to Neon PostgreSQL database (${Object.keys(this.data.users).length} users loaded/migrated)`
        );
      } catch (err) {
        console.error('❌ Failed to connect to Neon PostgreSQL database:', err);
        console.log('📦 Falling back to local JSON database.');
        this.pool = null;
      }
    } else {
      console.log(
        '📦 Local JSON database active. Set DATABASE_URL in .env to connect to Neon PostgreSQL.'
      );
    }
  }

  public isPostgresConnected(): boolean {
    return this.pool !== null;
  }

  public async close(): Promise<void> {
    if (this.pool) {
      const activePool = this.pool;
      this.pool = null;
      await activePool.end();
      console.log('🔌 Neon PostgreSQL connection pool closed.');
    }
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
      const jsonStr = JSON.stringify(this.data, null, 2);
      fs.writeFileSync(tempPath, jsonStr, 'utf-8');
      fs.renameSync(tempPath, this.filePath);
      if (Object.keys(this.data.users).length > 0) {
        console.log(`💾 Saved database (${Object.keys(this.data.users).length} users)`);
      }
    } catch (err) {
      console.error('Failed to persist database:', err);
    }
  }

  public getUser(userId: string): UserCalendarConfig | undefined {
    if (userId === 'demo-user') {
      return this.ensureDemoUser();
    }
    const user = this.data.users[userId];
    if (user && !user.calendars) {
      user.calendars = [];
      if (user.icalUrl) {
        user.calendars.push({
          id: 'primary',
          name: 'Primary',
          url: user.icalUrl,
          addedAt: user.createdAt || new Date().toISOString(),
        });
      }
    }
    return user;
  }

  public getAllUsers(): UserCalendarConfig[] {
    return Object.values(this.data.users).map((u) => {
      if (!u.calendars) {
        u.calendars = [];
        if (u.icalUrl) {
          u.calendars.push({
            id: 'primary',
            name: 'Primary',
            url: u.icalUrl,
            addedAt: u.createdAt || new Date().toISOString(),
          });
        }
      }
      return u;
    });
  }

  public saveUser(user: UserCalendarConfig): void {
    if (!user.calendars) {
      user.calendars = [];
      if (user.icalUrl) {
        user.calendars.push({
          id: 'primary',
          name: 'Primary',
          url: user.icalUrl,
          addedAt: user.createdAt || new Date().toISOString(),
        });
      }
    }
    this.data.users[user.userId] = user;
    this.persist();

    if (this.pool) {
      upsertUserToPostgres(this.pool, user).catch((err) => {
        console.error(
          `Failed to sync user ${user.userId} to Neon PostgreSQL:`,
          err
        );
      });
    }
  }

  public deleteUser(userId: string): boolean {
    if (this.data.users[userId]) {
      delete this.data.users[userId];
      this.persist();

      if (this.pool) {
        deleteUserFromPostgres(this.pool, userId).catch((err) => {
          console.error(
            `Failed to delete user ${userId} from Neon PostgreSQL:`,
            err
          );
        });
      }
      return true;
    }
    return false;
  }

  public addCalendar(
    userId: string,
    name: string,
    url: string,
    reminderMinutes = 10
  ): LinkedCalendar {
    let user = this.getUser(userId);
    const now = new Date().toISOString();

    if (!user) {
      user = {
        userId,
        calendars: [],
        reminderMinutes,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      };
    }

    // Check if URL already exists
    const existingIndex = user.calendars.findIndex((c) => c.url === url);
    const calendarId = `cal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newCal: LinkedCalendar = {
      id: calendarId,
      name: name || `Calendar ${user.calendars.length + 1}`,
      url,
      addedAt: now,
    };

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
      this.saveUser(user);
      return true;
    }

    const initialLen = user.calendars.length;
    user.calendars = user.calendars.filter(
      (c) =>
        c.id.toLowerCase() !== identifier.toLowerCase() &&
        c.name.toLowerCase() !== identifier.toLowerCase()
    );

    if (user.calendars.length !== initialLen) {
      if (user.calendars.length === 0) {
        delete user.icalUrl;
      } else {
        user.icalUrl = user.calendars[0].url;
      }
      this.saveUser(user);
      return true;
    }
    return false;
  }

  public hasReminderBeenSent(
    userId: string,
    eventId: string,
    leadMinutes: number
  ): boolean {
    const key = `${userId}:${eventId}:${leadMinutes}`;
    return Boolean(this.data.sentReminders[key]);
  }

  public markReminderSent(
    userId: string,
    eventId: string,
    leadMinutes: number
  ): void {
    const key = `${userId}:${eventId}:${leadMinutes}`;
    const now = Date.now();
    this.data.sentReminders[key] = now;
    this.persist();

    if (this.pool) {
      upsertReminderToPostgres(this.pool, key, now).catch((err) => {
        console.error(
          `Failed to record sent reminder ${key} in Neon PostgreSQL:`,
          err
        );
      });
    }
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

    if (this.pool) {
      cleanupRemindersInPostgres(this.pool, cutoff).catch((err) => {
        console.error(
          'Failed to cleanup old reminders in Neon PostgreSQL:',
          err
        );
      });
    }
  }
}

export const storage = new Storage();
export default storage;
