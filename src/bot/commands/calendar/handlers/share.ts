import { ChatInputCommandInteraction, EmbedBuilder, User } from 'discord.js';
import { ReminderEngine } from '../../../../calendar/reminderEngine';
import { storage } from '../../../../db/storage';
import { DEFAULT_TIMEZONE, EMBED_COLORS, VIEW_WINDOW_DAYS } from '../../../const';
import { EPHEMERAL, hasLinkedCalendar, truncate } from '../../../helpers';
import { PagerPayload, PagerState, buildPager, clampPage } from '../../../pager';
import {
  ALL_CALENDARS,
  applyCalendarFilter,
  calendarFilterOptions,
  resolveCalendarFilter,
  dayTitle,
  formatDayEvents,
  groupEventsByDay,
} from '../../../eventPages';
import { parseShareWindow, zonedDateKey } from '../../../../utils/time';

export const SHARE_PAGER_KIND = 's';

const DEFAULT_SHARE_WINDOW = '3d';

export async function renderSharePage(
  state: PagerState,
  author: User,
  reminderEngine: ReminderEngine,
  refresh: boolean,
): Promise<PagerPayload | string> {
  const user = storage.getUser(state.ownerId);
  if (!hasLinkedCalendar(user)) return "⚠️ You haven't linked a calendar yet! Use `/cal link` first.";

  const tz = user.timezone || DEFAULT_TIMEZONE;
  const now = new Date();
  const { windowEnd: cutoff, rangeDescription: timeLabel, windowDays } = parseShareWindow(
    state.extra || DEFAULT_SHARE_WINDOW,
    now,
    tz,
  );

  // Windows up to a week reuse the cached 7-day fetch; longer ones need their own.
  const allEvents =
    windowDays <= VIEW_WINDOW_DAYS
      ? await reminderEngine.getUserEvents(user, refresh)
      : await reminderEngine.getUserEvents(user, true, windowDays);
  const inWindow = allEvents.filter(
    (e) => e.start.getTime() <= cutoff.getTime() && e.end.getTime() >= now.getTime(),
  );
  const cutoffKey = zonedDateKey(cutoff, tz);
  const { filter, calendar } = resolveCalendarFilter(user, state.filter);
  const days = groupEventsByDay(applyCalendarFilter(inWindow, calendar?.id), tz, now).filter(
    (d) => d.key <= cutoffKey,
  );

  const page = clampPage(state.page, days.length);
  const day = days[page];
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.DISCORD_BLURPLE)
    .setAuthor({
      name: truncate(`${author.displayName}'s schedule • ${timeLabel}`),
      iconURL: author.displayAvatarURL(),
    });

  if (day) {
    embed
      .setTitle(dayTitle(day.key, tz, now))
      .setDescription(formatDayEvents(day.events, user.calendars.length > 1 && !calendar));
  } else {
    embed
      .setTitle('Completely free')
      .setDescription(`No events scheduled for **${timeLabel}**.`);
  }

  embed.addFields({
    name: '​',
    value: '✨ *Want this for your own calendar? Run `/cal guide` to get started.*',
  });

  return buildPager(embed, { ...state, page, filter }, days.length, {
    select: { placeholder: 'Filter by calendar', options: calendarFilterOptions(user) },
    footerNote: '🔒 Feed links and emails are never shared',
  });
}

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
  const until = (interaction.options.getString('until') || DEFAULT_SHARE_WINDOW).replace(/\|/g, '').slice(0, 10);

  try {
    const result = await renderSharePage(
      { kind: SHARE_PAGER_KIND, ownerId: interaction.user.id, page: 0, filter: ALL_CALENDARS, extra: until },
      interaction.user,
      reminderEngine,
      true,
    );
    return interaction.editReply(typeof result === 'string' ? { content: result } : result);
  } catch (err) {
    console.error('Failed to load events for /cal share:', err);
    return interaction.editReply({ content: '❌ Error loading your schedule. Please try again shortly.' });
  }
}
