import { ChatInputCommandInteraction } from 'discord.js';
import { storage } from '../../../../db/storage';
import { ReminderEngine } from '../../../../calendar/reminderEngine';
import { DEFAULT_DIGEST_TIME, DEFAULT_TIMEZONE } from '../../../const';
import { EPHEMERAL, hasLinkedCalendar } from '../../../helpers';
import { isValidTimezone, isValid24HourTime } from '../../../../utils/time';

export async function handleDaily(
  interaction: ChatInputCommandInteraction,
  reminderEngine: ReminderEngine,
) {
  const userId = interaction.user.id;
  await interaction.deferReply({ flags: EPHEMERAL });

  const user = storage.getUser(userId);
  if (!hasLinkedCalendar(user)) {
    return interaction.editReply({
      content: "⚠️ You haven't linked a calendar yet! Use `/cal link` first.",
    });
  }

  const timeInput = interaction.options.getString('time')?.trim();
  const enabledInput = interaction.options.getBoolean('enabled');
  const tzInput = interaction.options.getString('timezone')?.trim();
  const runTest = interaction.options.getBoolean('test');

  // Validate everything before mutating so a bad option never half-applies.
  if (timeInput && !isValid24HourTime(timeInput)) {
    return interaction.editReply({
      content:
        '⚠️ Please enter a valid 24-hour time between `00:00` and `23:59` (e.g. `08:00` or `14:30`).',
    });
  }
  if (tzInput && !isValidTimezone(tzInput)) {
    return interaction.editReply({
      content:
        '⚠️ Invalid timezone. Please enter a valid IANA timezone name (e.g. `America/New_York`, `America/Toronto`, `Europe/London`, `UTC`).',
    });
  }

  let updated = false;
  if (timeInput) {
    const [hh, mm] = timeInput.split(':');
    user.dailyDigestTime = `${hh.padStart(2, '0')}:${mm}`;
    user.dailyDigestEnabled = true;
    updated = true;
  }
  if (enabledInput !== null) {
    user.dailyDigestEnabled = enabledInput;
    updated = true;
  }
  if (tzInput) {
    user.timezone = tzInput;
    updated = true;
  }
  if (updated) {
    user.updatedAt = new Date().toISOString();
    storage.saveUser(user);
  }

  const status = user.dailyDigestEnabled ? '✅ Active' : '❌ Disabled';
  const deliveryTime = user.dailyDigestTime || DEFAULT_DIGEST_TIME;
  const timezone = user.timezone || DEFAULT_TIMEZONE;

  if (runTest) {
    const sent = await reminderEngine.sendDailyDigest(userId, true);
    return interaction.editReply({
      content: sent
        ? `📬 **Test daily briefing sent to your DMs!**\n\n⚙️ **Current Settings:**\n• Daily Digest: ${status}\n• Delivery Time: \`${deliveryTime}\`\n• Timezone: \`${timezone}\``
        : '⚠️ Failed to send test DM. Make sure your Discord privacy settings allow DMs from server members.',
    });
  }

  return interaction.editReply({
    content: `⚙️ **Daily Schedule Briefing Settings:**\n\n• Status: ${status}\n• Delivery Time: \`${deliveryTime}\` every morning\n• Timezone: \`${timezone}\`\n\n*Tip: Run \`/cal daily test: True\` to preview today's briefing in your DMs right now!*`,
  });
}
