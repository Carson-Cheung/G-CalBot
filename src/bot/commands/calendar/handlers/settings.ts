import { ChatInputCommandInteraction } from "discord.js";
import { storage } from "../../../../db/storage";

export async function handleSettings(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const user = storage.getUser(userId);
  if (!user) {
    return interaction.reply({
      content:
        "⚠️ You have not linked a calendar yet. Use `/cal link` first!",
      ephemeral: true,
    });
  }

  const remindBefore = interaction.options.getInteger(
    "remind_before",
    true,
  );
  user.reminderMinutes = remindBefore;
  user.updatedAt = new Date().toISOString();
  storage.saveUser(user);

  return interaction.reply({
    content: `✅ Reminder alert timing updated to **${remindBefore} minutes** before event start.`,
    ephemeral: true,
  });
}
