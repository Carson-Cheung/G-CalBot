import { ChatInputCommandInteraction } from 'discord.js';
import { findCalendarColor } from '../../../../calendarColors';
import { ReminderEngine } from '../../../../calendar/reminderEngine';
import { storage } from '../../../../db/storage';
import { EPHEMERAL } from '../../../helpers';

const notFound = (name: string) =>
  `⚠️ Could not find a calendar named \`${name}\`. Use \`/cal list\` to view your calendars.`;

export async function handleColor(
  interaction: ChatInputCommandInteraction,
  reminderEngine: ReminderEngine,
) {
  const target = interaction.options.getString('calendar', true).trim();
  const color = findCalendarColor(interaction.options.getString('colour', true));
  if (!color) {
    return interaction.reply({ content: '⚠️ That colour is not available.', flags: EPHEMERAL });
  }

  const calendar = storage.setCalendarColor(interaction.user.id, target, color.key);
  if (!calendar) return interaction.reply({ content: notFound(target), flags: EPHEMERAL });

  reminderEngine.invalidateUserCache(interaction.user.id);
  return interaction.reply({
    content: `${color.emoji} **${calendar.name}** is now **${color.name}**.`,
    flags: EPHEMERAL,
  });
}

export async function handleTop(
  interaction: ChatInputCommandInteraction,
  reminderEngine: ReminderEngine,
) {
  const target = interaction.options.getString('calendar', true).trim();
  const calendar = storage.moveCalendarToTop(interaction.user.id, target);
  if (!calendar) return interaction.reply({ content: notFound(target), flags: EPHEMERAL });

  reminderEngine.invalidateUserCache(interaction.user.id);
  return interaction.reply({
    content: `⬆️ **${calendar.name}** now shows first in your schedule.`,
    flags: EPHEMERAL,
  });
}
