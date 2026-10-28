import { ChatInputCommandInteraction } from 'discord.js';
import { ReminderEngine } from '../../../../calendar/reminderEngine';
import { DEFAULT_REMINDER_MINUTES } from '../../../const';
import { EPHEMERAL } from '../../../helpers';

const MINUTE_MS = 60 * 1000;
const TEST_EVENT_DURATION_MINUTES = 30;

export async function handleTest(
  interaction: ChatInputCommandInteraction,
  reminderEngine: ReminderEngine,
) {
  await interaction.deferReply({ flags: EPHEMERAL });
  const start = Date.now() + DEFAULT_REMINDER_MINUTES * MINUTE_MS;
  const testEvent = {
    id: `test_${Date.now()}`,
    title: '🎉 Google Calendar Reminder Test',
    description:
      'If you can read this, your Discord reminders are properly configured!',
    location: 'Discord Direct Message',
    start: new Date(start),
    end: new Date(start + TEST_EVENT_DURATION_MINUTES * MINUTE_MS),
    isAllDay: false,
    calendarName: 'Test',
  };

  const success = await reminderEngine.sendReminder(
    interaction.user.id,
    testEvent,
    DEFAULT_REMINDER_MINUTES,
  );
  return interaction.editReply({
    content: success
      ? '📬 Test reminder DM sent! Check your direct messages from this bot.'
      : '⚠️ Failed to send test DM. Please check your Discord privacy settings:\n' +
        'Go to **User Settings > Privacy & Safety > Allow direct messages from server members**.',
  });
}
