import { Client, Partials, REST, ActivityType, Events } from "discord.js";
import { GatewayIntentBits, Routes } from "discord-api-types/v10";
import { config } from "../config";
import { allCommands, commandsMap } from "./commands";
import { ReminderEngine } from "../calendar/reminderEngine";

export function createBot() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel, Partials.Message],
  });

  const reminderEngine = new ReminderEngine(client);

  client.once(Events.ClientReady, async () => {
    console.log(`🤖 Discord bot logged in as ${client.user?.tag}!`);
    client.user?.setActivity("/cal guide | 📅 Syncing", {
      type: ActivityType.Watching,
    });
    reminderEngine.start();

    // Register slash commands globally
    if (config.clientId && config.discordToken) {
      try {
        console.log("Registering application slash commands...");
        const rest = new REST({ version: "10" }).setToken(config.discordToken);
        const commands = allCommands.map((cmd) => cmd.data.toJSON());

        await rest.put(Routes.applicationCommands(config.clientId), {
          body: commands,
        });

        console.log("✅ Application slash commands registered successfully!");
      } catch (err) {
        console.error("Failed to register slash commands:", err);
      }
    } else {
      console.warn(
        "⚠️ DISCORD_CLIENT_ID or DISCORD_TOKEN missing in .env. Slash commands not auto-registered.",
      );
    }
  });

  // Dynamic Command Dispatcher - NO IF/ELSE STATEMENTS NEEDED!
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
      const command = commandsMap.get(interaction.commandName);
      if (command && typeof command.execute === "function") {
        await command.execute(interaction, reminderEngine);
      } else {
        console.warn(`Unrecognized command received: ${interaction.commandName}`);
      }
    } catch (err) {
      console.error("Error handling slash command:", err);
      const replyFn =
        interaction.replied || interaction.deferred ? "followUp" : "reply";
      await interaction[replyFn]({
        content: "An error occurred while executing this command.",
        ephemeral: true,
      }).catch(() => {});
    }
  });

  return { client, reminderEngine };
}
