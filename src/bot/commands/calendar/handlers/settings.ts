import { ChatInputCommandInteraction } from 'discord.js';
import { storage } from '../../../../db/storage';
import { EPHEMERAL } from '../../../helpers';

export async function handleSettings(interaction: ChatInputCommandInteraction) {
  const user = storage.getUser(interaction.user.id);
  if (!user) {
    return interaction.reply({
      content: '⚠️ You have not linked a calendar yet. Use `/cal link` first!',
      flags: EPHEMERAL,
    });
  }

  const remindBefore = interaction.options.getInteger('remind_before', true);
  user.reminderMinutes = remindBefore;
  user.updatedAt = new Date().toISOString();
  storage.saveUser(user);

  return interaction.reply({
    content: `✅ Reminder alert timing updated to **${remindBefore} minutes** before event start.`,
    flags: EPHEMERAL,
  });
}
