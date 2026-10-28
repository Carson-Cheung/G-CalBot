import { SlashCommandBuilder } from 'discord.js';
import { COMMAND_CONTEXTS, INTEGRATION_TYPES } from '../../const';

export function buildCalendarCommand(name: string) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription('Manage your Google Calendar reminders and sync')
    .setIntegrationTypes(INTEGRATION_TYPES)
    .setContexts(COMMAND_CONTEXTS)
    .addSubcommand((sub) =>
      sub
        .setName('link')
        .setDescription('Privately link a Google Calendar secret iCal URL')
        .addStringOption((opt) =>
          opt
            .setName('url')
            .setDescription(
              'The Secret address in iCal format from Google Calendar settings',
            )
            .setMaxLength(2000)
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setMaxLength(100)
            .setDescription(
              'Optional name for this calendar (e.g. Crow, Family, Work)',
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('View all of your connected Google Calendars'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('unlink')
        .setDescription('Unlink a specific calendar or all calendars')
        .addStringOption((opt) =>
          opt
            .setName('calendar')
            .setMaxLength(100)
            .setDescription(
              'Calendar name/ID to remove (leave blank to unlink all)',
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('View your upcoming calendar events'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('settings')
        .setDescription('Set how long before each event your reminder DM arrives')
        .addStringOption((opt) =>
          opt
            .setName('remind_before')
            .setDescription('e.g. 0, 10m, 45m, 2h, 1h30m, 1d (up to 7d). Leave empty to see your current setting')
            .setMaxLength(20)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('test')
        .setDescription('Send an immediate test reminder DM to your account'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('guide')
        .setDescription('How to get your private Google Calendar iCal link'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('share')
        .setDescription(
          'Post your schedule publicly in this channel for others to see',
        )
        .addStringOption((opt) =>
          opt
            .setName('until')
            .setMaxLength(10)
            .setDescription('e.g. tdy, tmr, 3d, 5d, 2w')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('daily')
        .setDescription(
          'Configure a daily morning briefing of all your tasks for today',
        )
        .addStringOption((opt) =>
          opt
            .setName('time')
            .setMaxLength(5)
            .setDescription('Time to send your daily digest (e.g. 08:30)')
            .setRequired(false),
        )
        .addBooleanOption((opt) =>
          opt
            .setName('enabled')
            .setDescription('Turn your daily morning digest on or off')
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName('timezone')
            .setMaxLength(64)
            .setDescription(
              'Your timezone (e.g. America/Toronto, EST, PST, UTC)',
            )
            .setRequired(false),
        )
        .addBooleanOption((opt) =>
          opt
            .setName('test')
            .setDescription(
              "Send today's daily briefing to your DMs right now to test",
            )
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('deletedata')
        .setDescription('Permanently delete everything this bot stores about you'),
    );
}
