import { ChatInputCommandInteraction } from "discord.js";
import { storage } from "../../../../db/storage";
import { ReminderEngine } from "../../../../calendar/reminderEngine";
import { DEFAULT_TIMEZONE } from "../../../const";
import { isValidTimezone, isValid24HourTime } from "../../../../utils/time";

export async function handleDaily(
  interaction: ChatInputCommandInteraction,
  reminderEngine?: ReminderEngine,
) {
  const userId = interaction.user.id;
  const user = storage.getUser(userId);
  if (!user || (!user.calendars.length && !user.icalUrl)) {
    return interaction.reply({
      content:
        "⚠️ You haven't linked a calendar yet! Use `/cal link` first.",
      ephemeral: true,
    });
  }
  await interaction.deferReply({ ephemeral: true });
  const timeInput = interaction.options.getString("time");
  const enabledInput = interaction.options.getBoolean("enabled");
  const tzInput = interaction.options.getString("timezone");
  const runTest = interaction.options.getBoolean("test");
  let updated = false;

  // 1. If user passed a time, validate it (e.g. "8:30" or "08:30")
  if (timeInput) {
    if (isValid24HourTime(timeInput)) {
      const [hh, mm] = timeInput.trim().split(":");
      user.dailyDigestTime = `${hh.padStart(2, "0")}:${mm}`;
      user.dailyDigestEnabled = true;
      updated = true;
    } else {
      return interaction.editReply({
        content:
          "⚠️ Please enter a valid 24-hour time between `00:00` and `23:59` (e.g. `08:00` or `14:30`).",
      });
    }
  }

  // 2. If user toggled enabled/disabled
  if (enabledInput !== null) {
    user.dailyDigestEnabled = enabledInput;
    updated = true;
  }

  // 3. If user provided timezone
  if (tzInput) {
    if (isValidTimezone(tzInput.trim())) {
      user.timezone = tzInput.trim();
      updated = true;
    } else {
      return interaction.editReply({
        content:
          "⚠️ Invalid timezone. Please enter a valid IANA timezone name (e.g. `America/New_York`, `America/Toronto`, `Europe/London`, `UTC`).",
      });
    }
  }

  if (updated) {
    user.updatedAt = new Date().toISOString();
    storage.saveUser(user);
  }

  // 4. If user asked for an immediate test preview
  if (runTest) {
    const sent = reminderEngine
      ? await reminderEngine.sendDailyDigest(userId, true)
      : false;
    if (sent) {
      return interaction.editReply({
        content: `📬 **Test daily briefing sent to your DMs!**\n\n⚙️ **Current Settings:**\n• Daily Digest: ${user.dailyDigestEnabled ? "✅ Active" : "❌ Disabled"}\n• Delivery Time: \`${user.dailyDigestTime || "08:00"}\`\n• Timezone: \`${user.timezone || DEFAULT_TIMEZONE || "America/Toronto"}\``,
      });
    } else {
      return interaction.editReply({
        content:
          "⚠️ Failed to send test DM. Make sure your Discord privacy settings allow DMs from server members.",
      });
    }
  }

  // 5. Show current status summary
  return interaction.editReply({
    content: `⚙️ **Daily Schedule Briefing Settings:**\n\n• Status: ${user.dailyDigestEnabled ? "✅ **Active**" : "❌ **Disabled**"}\n• Delivery Time: \`${user.dailyDigestTime || "08:00"}\` every morning\n• Timezone: \`${user.timezone || DEFAULT_TIMEZONE || "America/Toronto"}\`\n\n*Tip: Run \`/cal daily test: True\` to preview today's briefing in your DMs right now!*`,
  });
}
