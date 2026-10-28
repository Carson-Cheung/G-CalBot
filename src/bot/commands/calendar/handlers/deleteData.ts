import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { ReminderEngine } from '../../../../calendar/reminderEngine';
import { storage } from '../../../../db/storage';
import { EPHEMERAL } from '../../../helpers';

export const DELETE_DATA_PREFIX = 'deldata|';

export async function handleDeleteData(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('🗑️ Delete all your data?')
    .setDescription(
      'This permanently removes everything G-CalBot stores about you:\n' +
        '├ Your linked calendars and their secret links\n' +
        '├ Your reminder, time zone and daily summary settings\n' +
        '╰ The records of which reminders were already sent\n\n' +
        "Reminders stop right away. This can't be undone, but you can start fresh any time with `/cal link`.",
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${DELETE_DATA_PREFIX}${userId}|confirm`)
      .setLabel('Delete everything')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${DELETE_DATA_PREFIX}${userId}|cancel`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );

  return interaction.reply({ embeds: [embed], components: [row], flags: EPHEMERAL });
}

export async function handleDeleteDataButton(
  interaction: ButtonInteraction,
  reminderEngine: ReminderEngine,
) {
  const [, ownerId, action] = interaction.customId.split('|');
  if (ownerId !== interaction.user.id) {
    return interaction.reply({ content: 'This button is not for you.', flags: EPHEMERAL });
  }

  if (action !== 'confirm') {
    return interaction.update({ content: 'Cancelled. Nothing was deleted.', embeds: [], components: [] });
  }

  const deleted = storage.deleteUser(interaction.user.id);
  reminderEngine.invalidateUserCache(interaction.user.id);

  return interaction.update({
    content: deleted
      ? '✅ All your data has been deleted. Thanks for trying G-CalBot!'
      : "ℹ️ There was nothing stored about you, so there's nothing to delete.",
    embeds: [],
    components: [],
  });
}
