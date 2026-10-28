import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import {
  COMMAND_NAMES,
  COMMAND_CONTEXTS,
  INTEGRATION_TYPES,
} from '../const';
import { EPHEMERAL, openCalendarRow } from '../helpers';

function buildOpenCommand(name: string) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription('Direct link to open Google Calendar')
    .setIntegrationTypes(INTEGRATION_TYPES)
    .setContexts(COMMAND_CONTEXTS);
}

async function executeOpen(interaction: ChatInputCommandInteraction) {
  return interaction.reply({
    content: 'Click below to open Google Calendar:',
    components: [openCalendarRow()],
    flags: EPHEMERAL,
  });
}

export const openCommand = {
  data: buildOpenCommand(COMMAND_NAMES.OPEN),
  execute: executeOpen,
};

export const oCommand = {
  data: buildOpenCommand(COMMAND_NAMES.O),
  execute: executeOpen,
};
