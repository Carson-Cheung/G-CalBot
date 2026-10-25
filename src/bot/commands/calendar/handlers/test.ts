import { ChatInputCommandInteraction } from "discord.js";
import { ReminderEngine } from "../../../../calendar/reminderEngine";

export async function handleTest(
  interaction: ChatInputCommandInteraction,
  reminderEngine: ReminderEngine,
) {
  const userId = interaction.user.id;
  await interaction.deferReply({ ephemeral: true });
  const testEvent = {
    id: `test_${Date.now()}`,
    title: "🎉 Google Calendar Reminder Test",
    description:
      "If you can read this, your Discord reminders are properly configured!",
    location: "Discord Direct Message",
    start: new Date(Date.now() + 10 * 60 * 1000),
    end: new Date(Date.now() + 40 * 60 * 1000),
    isAllDay: false,
    calendarName: "Test",
  };

  const success = await reminderEngine.sendReminder(userId, testEvent, 10);
  if (success) {
    return interaction.editReply({
      content:
        "📬 Test reminder DM sent! Check your direct messages from this bot.",
    });
  } else {
    return interaction.editReply({
      content:
        "⚠️ Failed to send test DM. Please check your Discord privacy settings:\n" +
        "Go to **User Settings > Privacy & Safety > Allow direct messages from server members**.",
    });
  }
}
