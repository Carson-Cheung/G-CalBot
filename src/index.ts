import { config } from "./config";
import { createBot } from "./bot/client";
import { createServer } from "./server/app";

async function bootstrap() {
  console.log("🚀 Initializing Google Calendar Discord Bot & Activity...");

  const { client, reminderEngine } = createBot();
  const server = createServer(reminderEngine);

  // Start HTTP Server for Discord Activity & Web API
  server.listen(config.port, () => {
    console.log(
      `🌐 Web & Activity server listening at http://localhost:${config.port}`,
    );
  });

  // Login Discord Bot
  if (config.discordToken) {
    try {
      await client.login(config.discordToken);
    } catch (err) {
      console.error("❌ Failed to log into Discord with provided token:", err);
    }
  } else {
    console.warn(
      "⚠️ No DISCORD_TOKEN found in .env. Bot gateway is offline, but Web UI is running.",
    );
    console.warn(
      "👉 Please create a .env file and add your DISCORD_TOKEN to enable Discord slash commands & DMs.",
    );
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log("Stopping bot and services...");
    reminderEngine.stop();
    client.destroy();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
