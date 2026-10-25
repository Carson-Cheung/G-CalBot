import { config } from './config';
import { storage } from './db/storage';
import { createBot } from './bot/client';
import { createServer } from './server/app';
import { activityLogger } from './utils/activityLogger';

async function bootstrap() {
  console.log('🚀 Initializing Google Calendar Discord Bot & Activity...');
  activityLogger.log(
    'system',
    '🚀',
    'Initializing Google Calendar Discord Bot & Activity...'
  );

  // Initialize storage (Neon PostgreSQL if configured, or local JSON)
  await storage.initDatabase();

  const { client, reminderEngine } = createBot();
  const server = createServer(reminderEngine);

  // Start HTTP Server for Discord Activity & Web API
  const httpServer = server.listen(config.port, () => {
    console.log(
      `🌐 Web & Activity server listening at http://localhost:${config.port}`
    );
    activityLogger.log(
      'system',
      '🌐',
      `Web & Activity server listening at http://localhost:${config.port}`
    );
  });

  // Login Discord Bot
  if (config.discordToken) {
    try {
      await client.login(config.discordToken);
    } catch (err) {
      console.error('❌ Failed to log into Discord with provided token:', err);
      activityLogger.log(
        'warn',
        '⚠️',
        'Failed to log into Discord with provided token'
      );
    }
  } else {
    console.warn(
      '⚠️ No DISCORD_TOKEN found in .env. Bot gateway is offline, but Web UI is running.'
    );
    console.warn(
      '👉 Please create a .env file and add your DISCORD_TOKEN to enable Discord slash commands & DMs.'
    );
    activityLogger.log(
      'system',
      '🤖',
      'Discord bot logged in as G-CalBot#2765! (demo mode)'
    );
    reminderEngine.start();
    activityLogger.log(
      'system',
      '✅',
      'Application slash commands registered successfully! (demo)'
    );
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Stopping bot and services...');
    reminderEngine.stop();
    httpServer.close();
    await client.destroy();
    await storage.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
