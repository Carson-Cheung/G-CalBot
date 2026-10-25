import fs from 'fs';
import path from 'path';
import { config } from '../config';
import {
  createPostgresPool,
  initPostgresSchema,
  loadAllFromPostgres,
  upsertUserToPostgres,
} from './postgres';
import { UserCalendarConfig } from '../types';

async function runMigration(): Promise<void> {
  console.log('🚀 Starting Neon PostgreSQL Migration for G-CalBot...');

  const dbUrl = config.databaseUrl;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL is not defined in environment variables or .env file!');
    console.error('👉 Please configure DATABASE_URL in your .env file to run migration.');
    process.exit(1);
  }

  console.log('🔗 Connecting to Neon PostgreSQL...');
  const pool = createPostgresPool(dbUrl);

  try {
    console.log('🛠️ Initializing PostgreSQL tables (users, linked_calendars, sent_reminders)...');
    await initPostgresSchema(pool);
    console.log('✅ Tables initialized successfully.');

    // Aggregate users to migrate from data/database.json and DATABASE_BACKUP
    const usersToMigrate: Record<string, UserCalendarConfig> = {};

    // 1. Load from data/database.json
    const dbJsonPath =
      config.storagePath || path.resolve(process.cwd(), 'data', 'database.json');
    if (fs.existsSync(dbJsonPath)) {
      try {
        const raw = fs.readFileSync(dbJsonPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const users = parsed.users || {};
        for (const [id, user] of Object.entries(
          users as Record<string, UserCalendarConfig>
        )) {
          usersToMigrate[id] = user;
        }
        console.log(`📄 Loaded ${Object.keys(users).length} user(s) from ${dbJsonPath}`);
      } catch (err) {
        console.warn(`⚠️ Could not read ${dbJsonPath}:`, err);
      }
    }

    // 2. Load from DATABASE_BACKUP env var if present
    if (process.env.DATABASE_BACKUP) {
      try {
        const parsed = JSON.parse(process.env.DATABASE_BACKUP.trim());
        const users = parsed.users || parsed;
        for (const [id, user] of Object.entries(
          users as Record<string, UserCalendarConfig>
        )) {
          if (!usersToMigrate[id]) {
            usersToMigrate[id] = user;
          }
        }
      } catch (err) {
        console.warn('⚠️ Could not parse DATABASE_BACKUP environment variable:', err);
      }
    }

    // 3. Ensure demo-user is always present in Neon PostgreSQL
    if (!usersToMigrate['demo-user']) {
      usersToMigrate['demo-user'] = {
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

    // Normalize calendars and upsert each user to Neon PostgreSQL
    console.log(
      `🔄 Migrating ${Object.keys(usersToMigrate).length} user(s) to Neon PostgreSQL...`
    );
    for (const user of Object.values(usersToMigrate)) {
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
      await upsertUserToPostgres(pool, user);
      console.log(
        `  ✓ Migrated user ${user.userId} with ${user.calendars.length} linked calendar(s)`
      );
    }

    // Verify by loading back from Neon PostgreSQL
    console.log('\n🔍 Querying Neon PostgreSQL to verify migrated data...');
    const verification = await loadAllFromPostgres(pool);
    const verifiedUsers = Object.values(verification.users);

    console.log('\n======================================================');
    console.log(`🎉 Migration Completed! Total users in Neon: ${verifiedUsers.length}`);
    console.log('======================================================');
    for (const u of verifiedUsers) {
      console.log(`\n👤 User ID: ${u.userId}`);
      console.log(
        `   Reminders: ${u.reminderMinutes} min before | Enabled: ${u.enabled}`
      );
      console.log(
        `   Daily Digest: ${
          u.dailyDigestEnabled
            ? 'Enabled at ' + (u.dailyDigestTime || '08:00')
            : 'Disabled'
        }`
      );
      console.log(`   Timezone: ${u.timezone || 'Not set'}`);
      console.log(`   Linked Calendars (${u.calendars.length}):`);
      for (const cal of u.calendars) {
        console.log(`     • [${cal.id}] "${cal.name}" -> ${cal.url}`);
      }
    }
    console.log('\n======================================================\n');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration().catch((err) => {
  console.error('Fatal migration execution error:', err);
  process.exit(1);
});
