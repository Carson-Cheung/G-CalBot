import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { ReminderEngine } from '../../../../calendar/reminderEngine';
import { storage } from '../../../../db/storage';
import {
  DEFAULT_TIMEZONE,
  EMBED_COLORS,
  SHARE_MAX_EVENTS,
} from '../../../const';
import {
  EPHEMERAL,
  hasLinkedCalendar,
  toUnix,
  truncate,
} from '../../../helpers';
import { parseShareWindow } from '../../../../utils/time';

const DEFAULT_SHARE_WINDOW = '3d';

export async function handleShare(
  interaction: ChatInputCommandInteraction,
  reminderEngine: ReminderEngine,
) {
  const user = storage.getUser(interaction.user.id);
  if (!hasLinkedCalendar(user)) {
    return interaction.reply({
      content: "⚠️ You haven't linked a calendar yet! Use `/cal link` first.",
      flags: EPHEMERAL,
    });
  }

  // The schedule is intentionally public; only the pre-check above is private.
  await interaction.deferReply();
  const tz = user.timezone || DEFAULT_TIMEZONE;
  const until =
    interaction.options.getString('until') || DEFAULT_SHARE_WINDOW;
  const now = new Date();
  const {
    windowEnd: cutoff,
    rangeDescription: timeLabel,
    windowDays,
  } = parseShareWindow(until, now, tz);

  const allEvents = await reminderEngine.getUserEvents(user, true, windowDays);
  const sharedEvents = allEvents.filter(
    (e) =>
      e.start.getTime() <= cutoff.getTime() && e.end.getTime() >= now.getTime(),
  );

  const displayName = interaction.user.displayName;
  if (sharedEvents.length === 0) {
    return interaction.editReply({
      content: `📅 **${displayName}** has no events scheduled for **${timeLabel}** (completely free)!\n\n✨ *Like this bot? Get started with \`/cal guide\`!*`,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.DISCORD_BLURPLE)
    .setAuthor({
      name: truncate(`${displayName}'s Schedule • ${timeLabel}`),
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setDescription(
      `Sharing **${sharedEvents.length} event(s)** until <t:${toUnix(cutoff)}:D>:`,
    );

  for (const ev of sharedEvents.slice(0, SHARE_MAX_EVENTS)) {
    const start = toUnix(ev.start);
    const end = toUnix(ev.end);
    const calTag = ev.calendarName ? ` \`[${ev.calendarName}]\`` : '';
    const locTag = ev.location ? `\n📍 *${ev.location}*` : '';
    const timeStr = ev.isAllDay
      ? `<t:${start}:d> (All Day)`
      : `<t:${start}:F> (<t:${start}:R>) to <t:${end}:t>`;

    embed.addFields({
      name: truncate(`${ev.title}${calTag}`),
      value: truncate(`⏰ ${timeStr}${locTag}`, 1024),
    });
  }

  embed.addFields({
    name: '​',
    value:
      '✨ *Like what you see? Get started with `/cal guide` to link your own calendar!*',
  });

  embed.setFooter({
    text: '🔒 Privacy Protected: Email & feed URLs are never shared.\n⚠️ Note: Entry details (titles, times, locations) are visible in this channel.',
  });

  return interaction.editReply({ embeds: [embed] });
}
