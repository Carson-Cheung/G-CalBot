import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { storage } from "../../../../db/storage";
import { EMBED_COLORS } from "../../../const";

export async function handleList(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const user = storage.getUser(userId);
  if (!user || user.calendars.length === 0) {
    return interaction.reply({
      content:
        "ℹ️ You do not currently have any calendars linked. Use `/cal link` to add one!",
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.GOOGLE_BLUE)
    .setTitle("📅 Your Connected Calendars")
    .setDescription(
      `You have **${user.calendars.length} calendar(s)** connected:`,
    );

  for (let i = 0; i < user.calendars.length; i++) {
    const cal = user.calendars[i];
    embed.addFields({
      name: `${i + 1}. ${cal.name}`,
      value: `🔗 ID: \`${cal.id}\`\n🕒 Added <t:${Math.floor(new Date(cal.addedAt).getTime() / 1000)}:R>`,
    });
  }

  embed.setFooter({
    text: "Use `/cal unlink calendar:<name>` to remove an individual calendar.",
  });
  return interaction.reply({ embeds: [embed], ephemeral: true });
}
