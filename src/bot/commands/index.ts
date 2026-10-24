import { ChatInputCommandInteraction } from 'discord.js';
import { ReminderEngine } from '../../calendar/reminderEngine';
import { calendarCommand, calCommand } from './calendar';
import { activityCommand, actCommand } from './activity';
import { openCommand, oCommand } from './open';

export interface BotCommand {
  data: any;
  execute?: (interaction: ChatInputCommandInteraction, reminderEngine: ReminderEngine) => Promise<any>;
}

// Discord Activity Primary Entry Point (required by Discord when Activities are enabled)
export const entryPointCommand = {
  data: {
    name: 'launch',
    description: 'Launch an activity',
    type: 4, // PrimaryEntryPoint
    handler: 2, // Discord handles launching the activity
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    toJSON() {
      return {
        name: this.name,
        description: this.description,
        type: this.type,
        handler: this.handler,
        integration_types: this.integration_types,
        contexts: this.contexts,
      };
    },
  },
};

export const allCommands: BotCommand[] = [
  calendarCommand,
  calCommand,
  activityCommand,
  actCommand,
  openCommand,
  oCommand,
  entryPointCommand,
];

// Fast lookup Map: commandName -> command object
export const commandsMap = new Map<string, BotCommand>(
  allCommands
    .filter((cmd): cmd is BotCommand & { execute: NonNullable<BotCommand['execute']> } => typeof cmd.execute === 'function')
    .map((cmd) => [cmd.data.name, cmd])
);
