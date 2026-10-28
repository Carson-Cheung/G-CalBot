import { Pool } from 'pg';
import { UserCalendarConfig } from '../types';
import { resolveUserCalendars } from './userDefaults';

/**
 * Creates and configures a PostgreSQL connection pool with SSL enabled for Neon PostgreSQL.
 */
export function createPostgresPool(connectionString: string): Pool {
  let normalizedUrl = connectionString.trim();
  if (
    normalizedUrl.includes('sslmode=require') &&
    !normalizedUrl.includes('uselibpqcompat=')
  ) {
    normalizedUrl += `${normalizedUrl.includes('?') ? '&' : '?'}uselibpqcompat=true`;
  }
  const pool = new Pool({
    connectionString: normalizedUrl,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // Neon drops idle connections; without a listener pg re-emits that as an
  // unhandled 'error' event and crashes the process.
  pool.on('error', (err) => {
    console.error('PostgreSQL idle client error:', err.message);
  });
  return pool;
}

/**
 * Initializes the normalized relational schema in PostgreSQL if tables do not exist.
 */
export async function initPostgresSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      reminder_minutes INTEGER NOT NULL DEFAULT 10,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      ical_url TEXT,
      daily_digest_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      daily_digest_time TEXT,
      timezone TEXT,
      last_daily_digest_date TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS linked_calendars (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, id)
    );

    CREATE TABLE IF NOT EXISTS sent_reminders (
      reminder_key TEXT PRIMARY KEY,
      sent_at BIGINT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS sent_reminders_sent_at_idx ON sent_reminders (sent_at);
  `);
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

interface UserRow {
  user_id: string;
  reminder_minutes: number;
  enabled: boolean;
  ical_url: string | null;
  daily_digest_enabled: boolean;
  daily_digest_time: string | null;
  timezone: string | null;
  last_daily_digest_date: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CalendarRow {
  id: string;
  user_id: string;
  name: string;
  url: string;
  added_at: Date | string;
}

interface ReminderRow {
  reminder_key: string;
  sent_at: string | number;
}

/**
 * Loads all users, linked calendars, and sent reminders from PostgreSQL.
 */
export async function loadAllFromPostgres(pool: Pool): Promise<{
  users: Record<string, UserCalendarConfig>;
  sentReminders: Record<string, number>;
}> {
  const [usersResult, calendarsResult, remindersResult] = await Promise.all([
    pool.query<UserRow>(`
      SELECT user_id, reminder_minutes, enabled, ical_url,
             daily_digest_enabled, daily_digest_time, timezone,
             last_daily_digest_date, created_at, updated_at
      FROM users;
    `),
    pool.query<CalendarRow>(`
      SELECT id, user_id, name, url, added_at
      FROM linked_calendars
      ORDER BY added_at ASC;
    `),
    pool.query<ReminderRow>('SELECT reminder_key, sent_at FROM sent_reminders;'),
  ]);

  const users: Record<string, UserCalendarConfig> = {};

  for (const row of usersResult.rows) {
    users[row.user_id] = {
      userId: row.user_id,
      reminderMinutes: row.reminder_minutes ?? 10,
      enabled: row.enabled ?? true,
      icalUrl: row.ical_url || undefined,
      dailyDigestEnabled: row.daily_digest_enabled ?? false,
      dailyDigestTime: row.daily_digest_time || undefined,
      timezone: row.timezone || undefined,
      lastDailyDigestDate: row.last_daily_digest_date || undefined,
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
      calendars: [],
    };
  }

  for (const calRow of calendarsResult.rows) {
    users[calRow.user_id]?.calendars.push({
      id: calRow.id,
      name: calRow.name,
      url: calRow.url,
      addedAt: toIsoString(calRow.added_at),
    });
  }

  for (const user of Object.values(users)) {
    user.calendars = resolveUserCalendars(user);
  }

  const sentReminders: Record<string, number> = {};
  for (const remRow of remindersResult.rows) {
    sentReminders[remRow.reminder_key] = Number(remRow.sent_at);
  }

  return { users, sentReminders };
}

/**
 * Upserts a user and their linked calendars in PostgreSQL using a transaction.
 */
export async function upsertUserToPostgres(
  pool: Pool,
  user: UserCalendarConfig
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO users (
         user_id, reminder_minutes, enabled, ical_url,
         daily_digest_enabled, daily_digest_time, timezone,
         last_daily_digest_date, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id) DO UPDATE SET
         reminder_minutes = EXCLUDED.reminder_minutes,
         enabled = EXCLUDED.enabled,
         ical_url = EXCLUDED.ical_url,
         daily_digest_enabled = EXCLUDED.daily_digest_enabled,
         daily_digest_time = EXCLUDED.daily_digest_time,
         timezone = EXCLUDED.timezone,
         last_daily_digest_date = EXCLUDED.last_daily_digest_date,
         updated_at = EXCLUDED.updated_at;`,
      [
        user.userId,
        user.reminderMinutes ?? 10,
        user.enabled ?? true,
        user.icalUrl || null,
        user.dailyDigestEnabled ?? false,
        user.dailyDigestTime || null,
        user.timezone || null,
        user.lastDailyDigestDate || null,
        user.createdAt ? new Date(user.createdAt) : new Date(),
        user.updatedAt ? new Date(user.updatedAt) : new Date(),
      ]
    );

    await client.query('DELETE FROM linked_calendars WHERE user_id = $1;', [
      user.userId,
    ]);

    for (const cal of resolveUserCalendars(user)) {
      await client.query(
        `INSERT INTO linked_calendars (id, user_id, name, url, added_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, id) DO UPDATE SET
           name = EXCLUDED.name,
           url = EXCLUDED.url,
           added_at = EXCLUDED.added_at;`,
        [
          cal.id,
          user.userId,
          cal.name,
          cal.url,
          cal.addedAt ? new Date(cal.addedAt) : new Date(),
        ]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    // A failed ROLLBACK must not hide the error that caused it.
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Deletes a user from PostgreSQL (cascades to linked_calendars).
 */
export async function deleteUserFromPostgres(
  pool: Pool,
  userId: string
): Promise<void> {
  await pool.query('DELETE FROM users WHERE user_id = $1;', [userId]);
}

/**
 * Upserts a sent reminder record into PostgreSQL.
 */
export async function upsertReminderToPostgres(
  pool: Pool,
  key: string,
  timestamp: number
): Promise<void> {
  await pool.query(
    `INSERT INTO sent_reminders (reminder_key, sent_at)
     VALUES ($1, $2)
     ON CONFLICT (reminder_key) DO UPDATE SET
       sent_at = EXCLUDED.sent_at;`,
    [key, timestamp]
  );
}

/**
 * Cleans up sent reminders older than the cutoff timestamp.
 */
export async function cleanupRemindersInPostgres(
  pool: Pool,
  cutoff: number
): Promise<void> {
  await pool.query('DELETE FROM sent_reminders WHERE sent_at < $1;', [cutoff]);
}
