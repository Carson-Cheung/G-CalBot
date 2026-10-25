import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const parsedPort = parseInt(process.env.PORT || '3000', 10);
const parsedSync = parseInt(process.env.SYNC_INTERVAL_MINUTES || '5', 10);

export const config = {
  discordToken: process.env.DISCORD_TOKEN || '',
  clientId: process.env.DISCORD_CLIENT_ID || '',
  clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
  publicUrl: process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || 'https://g-calbot.onrender.com',
  port: Number.isNaN(parsedPort) ? 3000 : parsedPort,
  syncIntervalMinutes: Number.isNaN(parsedSync) ? 5 : parsedSync,
  storagePath: process.env.STORAGE_PATH || path.resolve(process.cwd(), 'data', 'database.json'),
  databaseUrl: process.env.DATABASE_URL || '',
  ownerUserId: process.env.OWNER_USER_ID || '',
  isDev: process.env.NODE_ENV !== 'production',
};

export default config;
