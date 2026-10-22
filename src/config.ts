import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  discordToken: process.env.DISCORD_TOKEN || '',
  clientId: process.env.DISCORD_CLIENT_ID || '',
  clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
  port: parseInt(process.env.PORT || '3000', 10),
  syncIntervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES || '5', 10),
  storagePath: process.env.STORAGE_PATH || path.resolve(process.cwd(), 'data', 'database.json'),
  isDev: process.env.NODE_ENV !== 'production'
};
