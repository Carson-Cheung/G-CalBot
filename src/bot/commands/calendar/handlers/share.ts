import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { ReminderEngine } from "../../../../calendar/reminderEngine";
import { storage } from "../../../../db/storage";
import { DEFAULT_TIMEZONE, EMBED_COLORS } from "../../../const";
import { parseShareWindow } from "../../../../utils/time";

export async function handleShare(
  interaction: ChatInputCommandInteraction,
  reminderEngine: ReminderEngine,
) {
  const userId = interaction.user.id;
  const user = storage.getUser(userId);
  if (!user || (!user.calendars.length && !user.icalUrl)) {
    return interaction.reply({
      content: "⚠️ You haven't linked a calendar yet! Use `/cal link` first.",
      ephemeral: true,
    });
  }
  await interaction.deferReply({ ephemeral: false });
  const tz = user.timezone || DEFAULT_TIMEZONE;
  const until = interaction.options.getString("until") || "3d";
  const now = new Date();
  const {
    windowEnd: cutoff,
    rangeDescription: timeLabel,
    windowDays,
  } = parseShareWindow(until, now, tz);

  const allEvents = await reminderEngine.getUserEvents(user, true, windowDays);

  // only keep events between time range
  const sharedEvents = allEvents.filter(
    (e) =>
      e.start.getTime() <= cutoff.getTime() && e.end.getTime() >= now.getTime(),
  );

  if (sharedEvents.length === 0) {
    return interaction.editReply({
      content: `📅 **${interaction.user.displayName}** has no events scheduled for **${timeLabel}** (completely free)!\n\n✨ *Like this bot? Get started with \`/cal guide\`!*`,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.DISCORD_BLURPLE) // Discord Blurple
    .setAuthor({
      name: `${interaction.user.displayName}'s Schedule • ${timeLabel}`,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setDescription(
      `Sharing **${sharedEvents.length} event(s)** until <t:${Math.floor(cutoff.getTime() / 1000)}:D>:`,
    );

  for (const ev of sharedEvents.slice(0, 15)) {
    const startSec = Math.floor(ev.start.getTime() / 1000);
    const endSec = Math.floor(ev.end.getTime() / 1000);
    const calTag = ev.calendarName ? ` \`[${ev.calendarName}]\`` : "";
    const locTag = ev.location ? `\n📍 *${ev.location}*` : "";

    const timeStr = ev.isAllDay
      ? `<t:${startSec}:d> (All Day)`
      : `<t:${startSec}:F> (<t:${startSec}:R>) to <t:${endSec}:t>`;

    embed.addFields({
      name: `${ev.title}${calTag}`,
      value: `⏰ ${timeStr}${locTag}`,
    });
  }

  embed.addFields({
    name: "\u200B",
    value:
      "✨ *Like what you see? Get started with `/cal guide` to link your own calendar!*",
  });

  embed.setFooter({
    text: "🔒 Privacy Protected: Email & feed URLs are never shared.\n⚠️ Note: Entry details (titles, times, locations) are visible in this channel.",
  });

  return interaction.editReply({ embeds: [embed] });
}
