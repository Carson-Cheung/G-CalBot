import {
  ChatInputCommandInteraction,
  RESTPostAPIApplicationCommandsJSONBody,
} from 'discord.js';
import { ReminderEngine } from '../../calendar/reminderEngine';
import { calendarCommand, calCommand } from './calendar';
import { dashboardCommand, dashCommand, actCommand } from './dashboard';
import { openCommand, oCommand } from './open';
import { COMMAND_CONTEXTS, INTEGRATION_TYPES } from '../const';

export interface BotCommand {
  data: { name: string; toJSON(): RESTPostAPIApplicationCommandsJSONBody };
  execute?: (
    interaction: ChatInputCommandInteraction,
    reminderEngine: ReminderEngine,
  ) => Promise<unknown>;
}

const PRIMARY_ENTRY_POINT = 4;
const ENTRY_POINT_HANDLER_DISCORD = 2;

// Required by Discord when Activities are enabled; Discord launches the activity itself.
const entryPointCommand: BotCommand = {
  data: {
    name: 'launch',
    toJSON: () =>
      ({
        name: 'launch',
        description: 'Launch an activity',
        type: PRIMARY_ENTRY_POINT,
        handler: ENTRY_POINT_HANDLER_DISCORD,
        integration_types: INTEGRATION_TYPES,
        contexts: COMMAND_CONTEXTS,
      }) as RESTPostAPIApplicationCommandsJSONBody,
  },
};

export const allCommands: BotCommand[] = [
  calendarCommand,
  calCommand,
  dashboardCommand,
  dashCommand,
  actCommand,
  openCommand,
  oCommand,
  entryPointCommand,
];

export const commandsMap = new Map<string, BotCommand>(
  allCommands
    .filter((cmd) => typeof cmd.execute === 'function')
    .map((cmd) => [cmd.data.name, cmd]),
);
