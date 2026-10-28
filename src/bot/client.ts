import {
  Client,
  Partials,
  ActivityType,
  Events,
  GatewayIntentBits,
  ChatInputCommandInteraction,
} from 'discord.js';
import { commandsMap } from './commands';
import { ReminderEngine } from '../calendar/reminderEngine';
import { deployCommands } from './deploy-commands';
import { activityLogger, censorUsername } from '../utils/activityLogger';
import { replyError } from './helpers';

function describeCommand(interaction: ChatInputCommandInteraction): string {
  const parts = [
    interaction.commandName,
    interaction.options.getSubcommandGroup(false),
    interaction.options.getSubcommand(false),
  ].filter(Boolean);
  const context = interaction.guildId ? 'guild' : 'DM';
  return `/${parts.join(' ')} (${context})`;
}

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

    await deployCommands();
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const description = describeCommand(interaction);
    const command = commandsMap.get(interaction.commandName);

    if (!command?.execute) {
      console.warn(`Unrecognized command received: ${interaction.commandName}`);
      activityLogger.log('warn', '⚠️', `Unrecognized command received: ${description}`);
      return;
    }

    try {
      const userMention = censorUsername(
        interaction.user.globalName || interaction.user.username,
      );
      activityLogger.log(
        'command',
        '⚡',
        `Executed slash command by ${userMention}: ${description}`,
      );
      await command.execute(interaction, reminderEngine);
    } catch (err) {
      console.error('Error handling slash command:', err);
      activityLogger.log('warn', '⚠️', `Error executing slash command: ${description}`);
      await replyError(
        interaction,
        'An error occurred while executing this command.',
      );
    }
  });

  return { client, reminderEngine };
}

export default createBot;
