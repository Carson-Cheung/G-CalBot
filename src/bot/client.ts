import { Client, Partials, ActivityType, Events } from 'discord.js';
import { GatewayIntentBits } from 'discord-api-types/v10';
import { commandsMap } from './commands';
import { ReminderEngine } from '../calendar/reminderEngine';
import { deployCommands } from './deploy-commands';
import { activityLogger } from '../utils/activityLogger';
import { storage } from '../db/storage';

export function createBot() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel, Partials.Message],
  });

  const reminderEngine = new ReminderEngine(client);

  client.once(Events.ClientReady, async () => {
    const botTag = client.user?.tag || 'G-CalBot#2765';
    console.log(`🤖 Discord bot logged in as ${botTag}!`);
    activityLogger.log('system', '🤖', `Discord bot logged in as ${botTag}!`);
    client.user?.setActivity('/cal guide | 📅 Syncing', {
      type: ActivityType.Watching,
    });
    reminderEngine.start();

    // Register slash commands globally
    await deployCommands();
  });

  // Dynamic Command Dispatcher
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.user?.id) {
      storage.setLastActiveUser(interaction.user.id);
    }
    if (!interaction.isChatInputCommand()) return;

    let subcommandGroup: string | null = null;
    let subcommand: string | null = null;
    try {
      subcommandGroup = interaction.options.getSubcommandGroup(false);
    } catch {
      subcommandGroup = null;
    }
    try {
      subcommand = interaction.options.getSubcommand(false);
    } catch {
      subcommand = null;
    }

    const commandParts = [interaction.commandName];
    if (subcommandGroup) commandParts.push(subcommandGroup);
    if (subcommand) commandParts.push(subcommand);

    const commandPath = `/${commandParts.join(' ')}`;
    const context = interaction.guildId ? 'guild' : 'DM';

    try {
      const command = commandsMap.get(interaction.commandName);
      if (command && typeof command.execute === 'function') {
        activityLogger.log(
          'command',
          '⚡',
          `Executed slash command: ${commandPath} (${context})`
        );
        await command.execute(interaction, reminderEngine);
      } else {
        console.warn(`Unrecognized command received: ${interaction.commandName}`);
        activityLogger.log(
          'warn',
          '⚠️',
          `Unrecognized command received: ${commandPath} (${context})`
        );
      }
    } catch (err) {
      console.error('Error handling slash command:', err);
      activityLogger.log(
        'warn',
        '⚠️',
        `Error executing slash command: ${commandPath} (${context})`
      );
      const replyFn =
        interaction.replied || interaction.deferred ? 'followUp' : 'reply';
      await interaction[replyFn]({
        content: 'An error occurred while executing this command.',
        ephemeral: true,
      }).catch(() => {});
    }
  });

  return { client, reminderEngine };
}

export default createBot;
