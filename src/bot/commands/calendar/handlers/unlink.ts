import { ChatInputCommandInteraction } from 'discord.js';
import { storage } from '../../../../db/storage';
import { ReminderEngine } from '../../../../calendar/reminderEngine';
import { EPHEMERAL } from '../../../helpers';

export async function handleUnlink(
  interaction: ChatInputCommandInteraction,
  reminderEngine: ReminderEngine,
) {
  const userId = interaction.user.id;
  const calendarTarget = interaction.options.getString('calendar')?.trim();
  const user = storage.getUser(userId);

  if (!user || user.calendars.length === 0) {
    return interaction.reply({
      content: 'ℹ️ You do not currently have any calendars linked.',
      flags: EPHEMERAL,
    });
  }

  if (!calendarTarget) {
    storage.removeCalendar(userId);
    reminderEngine.invalidateUserCache(userId);
    return interaction.reply({
      content:
        '✅ All your connected Google Calendars have been unlinked and reminders disabled.',
      flags: EPHEMERAL,
    });
  }

  const removed = storage.removeCalendar(userId, calendarTarget);
  reminderEngine.invalidateUserCache(userId);

  return interaction.reply({
    content: removed
      ? `✅ Calendar **${calendarTarget}** has been removed.`
      : `⚠️ Could not find a calendar named \`${calendarTarget}\`. Use \`/cal list\` to view your calendars.`,
    flags: EPHEMERAL,
  });
}
