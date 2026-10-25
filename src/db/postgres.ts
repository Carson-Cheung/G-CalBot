import { Pool, PoolClient } from 'pg';
import { UserCalendarConfig } from '../types';

/**
 * Creates and configures a PostgreSQL connection pool with SSL enabled for Neon PostgreSQL.
 */
export function createPostgresPool(connectionString: string): Pool {
  let normalizedUrl = connectionString.trim();
  if (
    normalizedUrl.includes('sslmode=require') &&
    !normalizedUrl.includes('uselibpqcompat=')
  ) {
    normalizedUrl += '&uselibpqcompat=true';
  }
  return new Pool({
    connectionString: normalizedUrl,
    ssl: { rejectUnauthorized: false },
  });
}

/**
 * Initializes the normalized relational schema in PostgreSQL if tables do not exist.
 */
export async function initPostgresSchema(pool: Pool): Promise<void> {
  const schemaQuery = `
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
  `;

  await pool.query(schemaQuery);
}

/**
 * Loads all users, linked calendars, and sent reminders from PostgreSQL.
 */
export async function loadAllFromPostgres(pool: Pool): Promise<{
  users: Record<string, UserCalendarConfig>;
  sentReminders: Record<string, number>;
}> {
  const usersResult = await pool.query<{
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
  }>(`
    SELECT user_id, reminder_minutes, enabled, ical_url,
           daily_digest_enabled, daily_digest_time, timezone,
           last_daily_digest_date, created_at, updated_at
    FROM users;
  `);

  const calendarsResult = await pool.query<{
    id: string;
    user_id: string;
    name: string;
    url: string;
    added_at: Date | string;
  }>(`
    SELECT id, user_id, name, url, added_at
    FROM linked_calendars
    ORDER BY added_at ASC;
  `);

  const remindersResult = await pool.query<{
    reminder_key: string;
    sent_at: string | number;
  }>(`
    SELECT reminder_key, sent_at
    FROM sent_reminders;
  `);

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
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : String(row.updated_at),
      calendars: [],
    };
  }

  for (const calRow of calendarsResult.rows) {
    if (users[calRow.user_id]) {
      const addedAt =
        calRow.added_at instanceof Date
          ? calRow.added_at.toISOString()
          : String(calRow.added_at);

      users[calRow.user_id].calendars.push({
        id: calRow.id,
        name: calRow.name,
        url: calRow.url,
        addedAt,
      });
    }
  }

  // Backwards compatibility: if no linked calendars exist but icalUrl does
  for (const user of Object.values(users)) {
    if (user.calendars.length === 0 && user.icalUrl) {
      user.calendars.push({
        id: 'primary',
        name: 'Primary',
        url: user.icalUrl,
        addedAt: user.createdAt,
      });
    }
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
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    const userUpsertQuery = `
      INSERT INTO users (
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
        updated_at = EXCLUDED.updated_at;
    `;

    const createdAt = user.createdAt ? new Date(user.createdAt) : new Date();
    const updatedAt = user.updatedAt ? new Date(user.updatedAt) : new Date();

    await client.query(userUpsertQuery, [
      user.userId,
      user.reminderMinutes ?? 10,
      user.enabled ?? true,
      user.icalUrl || null,
      user.dailyDigestEnabled ?? false,
      user.dailyDigestTime || null,
      user.timezone || null,
      user.lastDailyDigestDate || null,
      createdAt,
      updatedAt,
    ]);

    // Replace linked calendars for this user
    await client.query('DELETE FROM linked_calendars WHERE user_id = $1;', [
      user.userId,
    ]);

    const calendarsToInsert =
      user.calendars && user.calendars.length > 0
        ? user.calendars
        : user.icalUrl
          ? [
              {
                id: 'primary',
                name: 'Primary',
                url: user.icalUrl,
                addedAt: user.createdAt || new Date().toISOString(),
              },
            ]
          : [];

    for (const cal of calendarsToInsert) {
      const addedAt = cal.addedAt ? new Date(cal.addedAt) : new Date();
      await client.query(
        `INSERT INTO linked_calendars (id, user_id, name, url, added_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, id) DO UPDATE SET
           name = EXCLUDED.name,
           url = EXCLUDED.url,
           added_at = EXCLUDED.added_at;`,
        [cal.id, user.userId, cal.name, cal.url, addedAt]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
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
