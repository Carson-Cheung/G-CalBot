import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { storage } from '../../../../db/storage';
import { EMBED_COLORS } from '../../../const';
import { EPHEMERAL, toUnix, truncate } from '../../../helpers';

const MAX_EMBED_FIELDS = 25;

export async function handleList(interaction: ChatInputCommandInteraction) {
  const user = storage.getUser(interaction.user.id);
  if (!user || user.calendars.length === 0) {
    return interaction.reply({
      content:
        'ℹ️ You do not currently have any calendars linked. Use `/cal link` to add one!',
      flags: EPHEMERAL,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.GOOGLE_BLUE)
    .setTitle('📅 Your Connected Calendars')
    .setDescription(
      `You have **${user.calendars.length} calendar(s)** connected:`,
    )
    .setFooter({
      text: 'Use `/cal unlink calendar:<name>` to remove an individual calendar.',
    });

  user.calendars.slice(0, MAX_EMBED_FIELDS).forEach((cal, i) => {
    embed.addFields({
      name: truncate(`${i + 1}. ${cal.name}`),
      value: `🔗 ID: \`${cal.id}\`\n🕒 Added <t:${toUnix(cal.addedAt)}:R>`,
    });
  });

  return interaction.reply({ embeds: [embed], flags: EPHEMERAL });
}
