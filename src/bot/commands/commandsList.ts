import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { COMMAND_CONTEXTS, COMMAND_NAMES, EMBED_COLORS, INTEGRATION_TYPES } from '../const';
import { EPHEMERAL } from '../helpers';
import { PagerPayload, PagerState, buildPager, clampPage } from '../pager';

export const COMMANDS_PAGER_KIND = 'c';

interface CommandInfo {
  usage: string;
  alias?: string;
  description: string;
  example?: string;
}

interface CommandCategory {
  title: string;
  emoji: string;
  summary: string;
  commands: CommandInfo[];
}

const CATEGORIES: CommandCategory[] = [
  {
    title: 'Getting started',
    emoji: '🚀',
    summary: 'Connect and manage your calendars',
    commands: [
      { usage: '/calendar guide', alias: '/cal guide', description: 'Step-by-step walkthrough for finding your secret iCal link' },
      {
        usage: '/calendar link <url> [name]',
        alias: '/cal link',
        description: 'Connect a Google Calendar or any .ics feed (up to 10)',
        example: '/cal link url:<secret link> name:Work',
      },
      { usage: '/calendar list', alias: '/cal list', description: 'See every calendar you have connected' },
      { usage: '/calendar unlink [calendar]', alias: '/cal unlink', description: 'Remove one calendar by name, or all of them' },
    ],
  },
  {
    title: 'Your schedule',
    emoji: '📅',
    summary: 'View and share upcoming events',
    commands: [
      { usage: '/calendar view', alias: '/cal view', description: 'Browse your next 7 days, one day per page (only you can see it)' },
      {
        usage: '/calendar share [until]',
        alias: '/cal share',
        description: 'Post your schedule in the channel for everyone to see',
        example: '/cal share until:tmr   (tdy, tmr, 3d, 2w)',
      },
      { usage: '/open', alias: '/o', description: 'Get a button that opens Google Calendar' },
    ],
  },
  {
    title: 'Reminders',
    emoji: '🔔',
    summary: 'Control when DMs arrive',
    commands: [
      {
        usage: '/calendar settings [remind_before]',
        alias: '/cal settings',
        description: 'Set how long before each event your reminder arrives (up to 7 days)',
        example: '/cal settings remind_before:1h30m   (0, 45m, 2h, 1d)',
      },
      {
        usage: '/calendar daily [time] [enabled] [timezone]',
        alias: '/cal daily',
        description: 'Get a morning summary of your day at a time you choose',
        example: '/cal daily time:08:30 timezone:America/Toronto',
      },
      { usage: '/calendar test', alias: '/cal test', description: 'Send yourself a test reminder to check your DMs work' },
    ],
  },
  {
    title: 'Dashboard & help',
    emoji: '🧭',
    summary: 'The Activity dashboard and this list',
    commands: [
      { usage: '/dashboard', alias: '/dash, /act', description: 'Open the dashboard Activity inside Discord' },
      { usage: '/commands', alias: '/comms', description: 'Show this list' },
    ],
  },
];

function formatCommand(cmd: CommandInfo): string {
  const details = [cmd.description, cmd.alias ? `Shortcut: \`${cmd.alias}\`` : null, cmd.example ? `e.g. \`${cmd.example}\`` : null]
    .filter((line): line is string => Boolean(line))
    .map((line, i, all) => `${i === all.length - 1 ? '╰' : '├'} ${line}`);
  return [`**\`${cmd.usage}\`**`, ...details].join('\n');
}

export function renderCommandsPage(state: PagerState): PagerPayload {
  const index = clampPage(state.page, CATEGORIES.length);
  const category = CATEGORIES[index]!;

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.DISCORD_BLURPLE)
    .setAuthor({ name: '📜 G-CalBot commands' })
    .setTitle(`${category.emoji} ${category.title}`)
    .setDescription(category.commands.map(formatCommand).join('\n\n'));

  return buildPager(embed, { ...state, page: index, filter: String(index) }, CATEGORIES.length, {
    select: {
      placeholder: 'Jump to a category',
      options: CATEGORIES.map((c, i) => ({ value: String(i), label: c.title, description: c.summary, emoji: c.emoji })),
    },
  });
}

async function executeCommands(interaction: ChatInputCommandInteraction) {
  const page = renderCommandsPage({
    kind: COMMANDS_PAGER_KIND,
    ownerId: interaction.user.id,
    page: 0,
    filter: '0',
    extra: '',
  });
  return interaction.reply({ ...page, flags: EPHEMERAL });
}

function buildCommandsCommand(name: string) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription('List every command this bot has')
    .setIntegrationTypes(INTEGRATION_TYPES)
    .setContexts(COMMAND_CONTEXTS);
}

export const commandsCommand = {
  data: buildCommandsCommand(COMMAND_NAMES.COMMANDS),
  execute: executeCommands,
};

export const commsCommand = {
  data: buildCommandsCommand(COMMAND_NAMES.COMMS),
  execute: executeCommands,
};
