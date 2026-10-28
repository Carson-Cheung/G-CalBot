import { Server } from 'http';
import { config, validateConfig } from './config';
import { storage } from './db/storage';
import { createBot } from './bot/client';
import { createServer } from './server/app';
import { activityLogger } from './utils/activityLogger';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function checkConfigOrExit(): void {
  const { errors, warnings } = validateConfig();
  for (const warning of warnings) console.warn(`⚠️ ${warning}`);
  if (errors.length > 0) {
    for (const error of errors) console.error(`❌ Invalid configuration: ${error}`);
    process.exit(1);
  }
}

function listen(app: ReturnType<typeof createServer>): Promise<Server> {
  return new Promise((resolve, reject) => {
    const httpServer = app.listen(config.port, () => resolve(httpServer));
    httpServer.once('error', reject);
    httpServer.requestTimeout = 30_000;
    httpServer.headersTimeout = 15_000;
  });
}

function closeServer(httpServer: Server): Promise<void> {
  return new Promise((resolve) => {
    httpServer.close(() => resolve());
    // Keep-alive sockets would otherwise hold close() open until they time out.
    httpServer.closeIdleConnections();
  });
}

async function bootstrap() {
  checkConfigOrExit();

  console.log('🚀 Initializing Google Calendar Discord Bot & Activity...');
  activityLogger.log('system', '🚀', 'Initializing Google Calendar Discord Bot & Activity...');

  await storage.initDatabase();

  const { client, reminderEngine } = createBot();
  const httpServer = await listen(createServer(reminderEngine));
  const listeningMessage = `Web & Activity server listening at http://localhost:${config.port}`;
  console.log(`🌐 ${listeningMessage}`);
  activityLogger.log('system', '🌐', listeningMessage);

  let shuttingDown = false;
  const shutdown = async (reason: string, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Stopping bot and services (${reason})...`);

    const forceExit = setTimeout(() => {
      console.error('Graceful shutdown timed out; forcing exit.');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    reminderEngine.stop();
    const results = await Promise.allSettled([closeServer(httpServer), client.destroy()]);
    // Close the pool last so in-flight requests and the bot can finish their writes.
    results.push(...(await Promise.allSettled([storage.close()])));
    for (const result of results) {
      if (result.status === 'rejected') console.error('Error during shutdown:', result.reason);
    }
    process.exit(exitCode);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    void shutdown('uncaughtException', 1);
  });

  if (config.discordToken) {
    try {
      await client.login(config.discordToken);
    } catch (err) {
      console.error('❌ Failed to log into Discord with provided token:', err);
      activityLogger.log('warn', '⚠️', 'Failed to log into Discord with provided token');
    }
  } else {
    console.warn('⚠️ No DISCORD_TOKEN found in .env. Bot gateway is offline, but Web UI is running.');
    console.warn(
      '👉 Please create a .env file and add your DISCORD_TOKEN to enable Discord slash commands & DMs.'
    );
    activityLogger.log('system', '🤖', 'Discord bot logged in as G-CalBot#2765! (demo mode)');
    reminderEngine.start();
    activityLogger.log('system', '✅', 'Application slash commands registered successfully! (demo)');
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
