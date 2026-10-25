import { REST } from 'discord.js';
import { Routes } from 'discord-api-types/v10';
import { config } from '../config';
import { allCommands } from './commands';
import { activityLogger } from '../utils/activityLogger';

export async function deployCommands(): Promise<void> {
  if (!config.clientId || !config.discordToken) {
    console.warn(
      '⚠️ DISCORD_CLIENT_ID or DISCORD_TOKEN missing in .env. Slash commands not auto-registered.'
    );
    return;
  }

  try {
    console.log('Registering application slash commands...');
    const rest = new REST({ version: '10' }).setToken(config.discordToken);
    const commands = allCommands.map((cmd) => cmd.data.toJSON());

    await rest.put(Routes.applicationCommands(config.clientId), {
      body: commands,
    });

    console.log('✅ Application slash commands registered successfully!');
    activityLogger.log(
      'system',
      '✅',
      'Application slash commands registered successfully!'
    );
  } catch (err) {
    console.error('Failed to register slash commands:', err);
    activityLogger.log(
      'warn',
      '⚠️',
      'Failed to register application slash commands'
    );
  }
}

// Support direct execution via tsx src/bot/deploy-commands.ts
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('deploy-commands.ts')) {
  deployCommands();
}
