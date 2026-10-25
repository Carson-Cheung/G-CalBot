import { ChatInputCommandInteraction } from "discord.js";
import { storage } from "../../../../db/storage";
import { ReminderEngine } from "../../../../calendar/reminderEngine";

export async function handleUnlink(
  interaction: ChatInputCommandInteraction,
  reminderEngine?: ReminderEngine,
) {
  const userId = interaction.user.id;
  const calendarTarget = interaction.options.getString("calendar");
  const user = storage.getUser(userId);

  if (!user || user.calendars.length === 0) {
    return interaction.reply({
      content: "ℹ️ You do not currently have any calendars linked.",
      ephemeral: true,
    });
  }

  if (calendarTarget) {
    const removed = storage.removeCalendar(userId, calendarTarget);
    if (reminderEngine) {
      reminderEngine.invalidateUserCache(userId);
    }

    if (removed) {
      return interaction.reply({
        content: `✅ Calendar **${calendarTarget}** has been removed.`,
        ephemeral: true,
      });
    } else {
      return interaction.reply({
        content: `⚠️ Could not find a calendar named \`${calendarTarget}\`. Use \`/cal list\` to view your calendars.`,
        ephemeral: true,
      });
    }
  } else {
    storage.removeCalendar(userId);
    if (reminderEngine) {
      reminderEngine.invalidateUserCache(userId);
    }
    return interaction.reply({
      content:
        "✅ All your connected Google Calendars have been unlinked and reminders disabled.",
      ephemeral: true,
    });
  }
}
