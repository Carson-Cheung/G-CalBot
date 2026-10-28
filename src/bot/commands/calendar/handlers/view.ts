import { ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { storage } from '../../../../db/storage';
import { ReminderEngine } from '../../../../calendar/reminderEngine';
import { DEFAULT_TIMEZONE, EMBED_COLORS, GOOGLE_CALENDAR_URL, VIEW_WINDOW_DAYS } from '../../../const';
import { EPHEMERAL, hasLinkedCalendar } from '../../../helpers';
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

export const VIEW_PAGER_KIND = 'v';

const NOT_LINKED = '⚠️ You have not linked a calendar yet. Use `/cal link` or `/cal guide` to get started!';

export async function renderViewPage(
  state: PagerState,
  reminderEngine: ReminderEngine,
  refresh: boolean,
): Promise<PagerPayload | string> {
  const user = storage.getUser(state.ownerId);
  if (!hasLinkedCalendar(user)) return NOT_LINKED;

  const tz = user.timezone || DEFAULT_TIMEZONE;
  const { filter, label: calendarLabel, calendar } = resolveCalendarFilter(user, state.filter);
  const events = applyCalendarFilter(await reminderEngine.getUserEvents(user, refresh), calendar?.id);
  const days = groupEventsByDay(events, tz);

  const embed = new EmbedBuilder().setColor(EMBED_COLORS.GOOGLE_BLUE);
  const page = clampPage(state.page, days.length);
  const day = days[page];

  if (day) {
    embed
      .setAuthor({ name: `📅 Your schedule • ${calendarLabel}` })
      .setTitle(dayTitle(day.key, tz))
      .setDescription(formatDayEvents(day.events, user.calendars.length > 1 && !calendar));
  } else {
    embed
      .setAuthor({ name: `📅 Your schedule • ${calendarLabel}` })
      .setTitle('Nothing scheduled')
      .setDescription(`No upcoming events in the next ${VIEW_WINDOW_DAYS} days.`);
  }

  return buildPager(embed, { ...state, page, filter }, days.length, {
    select: { placeholder: 'Filter by calendar', options: calendarFilterOptions(user) },
    footerNote: `Next ${VIEW_WINDOW_DAYS} days`,
    extraButtons: [
      new ButtonBuilder()
        .setLabel('Open Google Calendar')
        .setEmoji('📅')
        .setStyle(ButtonStyle.Link)
        .setURL(GOOGLE_CALENDAR_URL),
    ],
  });
}

export async function handleView(
  interaction: ChatInputCommandInteraction,
  reminderEngine: ReminderEngine,
) {
  await interaction.deferReply({ flags: EPHEMERAL });

  try {
    const result = await renderViewPage(
      { kind: VIEW_PAGER_KIND, ownerId: interaction.user.id, page: 0, filter: ALL_CALENDARS, extra: '' },
      reminderEngine,
      true,
    );
    return interaction.editReply(typeof result === 'string' ? { content: result } : result);
  } catch (err) {
    console.error('Failed to load events for /cal view:', err);
    return interaction.editReply({ content: '❌ Error loading events. Please try again shortly.' });
  }
}
