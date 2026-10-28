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
import { DEMO_USER_ID, createDemoUser, normalizeUserCalendars } from './userDefaults';

// Secret iCal addresses grant read access to a calendar, so only the host is logged.
function describeFeedHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '(invalid URL)';
  }
}

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

    if (!usersToMigrate[DEMO_USER_ID]) {
      usersToMigrate[DEMO_USER_ID] = createDemoUser();
    }

    console.log(
      `🔄 Migrating ${Object.keys(usersToMigrate).length} user(s) to Neon PostgreSQL...`
    );
    for (const user of Object.values(usersToMigrate)) {
      normalizeUserCalendars(user);
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
        console.log(`     • [${cal.id}] "${cal.name}" -> ${describeFeedHost(cal.url)}`);
      }
    }
    console.log('\n======================================================\n');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    // exitCode rather than exit() so the finally block still closes the pool.
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runMigration().catch((err) => {
  console.error('Fatal migration execution error:', err);
  process.exit(1);
});
