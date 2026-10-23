import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { UserCalendarConfig, LinkedCalendar } from '../types';

interface DatabaseSchema {
  users: Record<string, UserCalendarConfig>;
  sentReminders: Record<string, number>; // key: `${userId}:${eventId}:${leadMinutes}` -> timestamp
}

class Storage {
  private filePath: string;
  private data: DatabaseSchema;

  constructor() {
    this.filePath = config.storagePath;
    this.data = {
      users: {},
      sentReminders: {}
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
          sentReminders: parsed.sentReminders || {}
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
                addedAt: user.createdAt || new Date().toISOString()
              });
            }
          }
        }
      } catch (err) {
        console.error('Failed to parse database file, resetting to empty data:', err);
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
        const backupUsers: Record<string, UserCalendarConfig> = parsedBackup.users || (typeof parsedBackup === 'object' ? parsedBackup : {});
        let restoredCount = 0;

        for (const [userId, uConfig] of Object.entries(backupUsers)) {
          if (!this.data.users[userId]) {
            this.data.users[userId] = uConfig;
            restoredCount++;
          }
        }

        if (parsedBackup.sentReminders) {
          this.data.sentReminders = { ...parsedBackup.sentReminders, ...this.data.sentReminders };
        }

        if (restoredCount > 0) {
          console.log(`✅ Restored/Merged ${restoredCount} user(s) from DATABASE_BACKUP environment variable! (Total: ${Object.keys(this.data.users).length})`);
          this.persist();
        }
      } catch (bErr) {
        console.error('Failed to parse DATABASE_BACKUP environment variable:', bErr);
      }
    }
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
    const user = this.data.users[userId];
    if (user && !user.calendars) {
      user.calendars = [];
      if (user.icalUrl) {
        user.calendars.push({
          id: 'primary',
          name: 'Primary',
          url: user.icalUrl,
          addedAt: user.createdAt || new Date().toISOString()
        });
      }
    }
    return user;
  }

  public getAllUsers(): UserCalendarConfig[] {
    return Object.values(this.data.users).map(u => {
      if (!u.calendars) {
        u.calendars = [];
        if (u.icalUrl) {
          u.calendars.push({
            id: 'primary',
            name: 'Primary',
            url: u.icalUrl,
            addedAt: u.createdAt || new Date().toISOString()
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
          addedAt: user.createdAt || new Date().toISOString()
        });
      }
    }
    this.data.users[user.userId] = user;
    this.persist();
  }

  public deleteUser(userId: string): boolean {
    if (this.data.users[userId]) {
      delete this.data.users[userId];
      this.persist();
      return true;
    }
    return false;
  }

  public addCalendar(userId: string, name: string, url: string, reminderMinutes = 10): LinkedCalendar {
    let user = this.getUser(userId);
    const now = new Date().toISOString();

    if (!user) {
      user = {
        userId,
        calendars: [],
        reminderMinutes,
        enabled: true,
        createdAt: now,
        updatedAt: now
      };
    }

    // Check if URL already exists
    const existingIndex = user.calendars.findIndex(c => c.url === url);
    const calendarId = `cal_${Date.now()}`;
    const newCal: LinkedCalendar = {
      id: calendarId,
      name: name || `Calendar ${user.calendars.length + 1}`,
      url,
      addedAt: now
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
      c => c.id.toLowerCase() !== identifier.toLowerCase() && c.name.toLowerCase() !== identifier.toLowerCase()
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

  public hasReminderBeenSent(userId: string, eventId: string, leadMinutes: number): boolean {
    const key = `${userId}:${eventId}:${leadMinutes}`;
    return Boolean(this.data.sentReminders[key]);
  }

  public markReminderSent(userId: string, eventId: string, leadMinutes: number): void {
    const key = `${userId}:${eventId}:${leadMinutes}`;
    this.data.sentReminders[key] = Date.now();
    this.persist();
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
  }
}

export const storage = new Storage();
