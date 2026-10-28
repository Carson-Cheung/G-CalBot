import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { storage } from '../../../../db/storage';
import { ReminderEngine } from '../../../../calendar/reminderEngine';
import {
  EMBED_COLORS,
  VIEW_MAX_EVENTS,
  VIEW_WINDOW_DAYS,
} from '../../../const';
import {
  EPHEMERAL,
  hasLinkedCalendar,
  openCalendarRow,
  toUnix,
  truncate,
} from '../../../helpers';

export async function handleView(
  interaction: ChatInputCommandInteraction,
  reminderEngine: ReminderEngine,
) {
  await interaction.deferReply({ flags: EPHEMERAL });
  const user = storage.getUser(interaction.user.id);
  if (!hasLinkedCalendar(user)) {
    return interaction.editReply({
      content:
        '⚠️ You have not linked a calendar yet. Use `/cal link` or `/cal guide` to get started!',
    });
  }

  try {
    const events = await reminderEngine.getUserEvents(user, true);

    if (events.length === 0) {
      return interaction.editReply({
        content: `📅 No upcoming events found in your calendar(s) for the next ${VIEW_WINDOW_DAYS} days.`,
      });
    }

    const shown = events.slice(0, VIEW_MAX_EVENTS);
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.GOOGLE_BLUE)
      .setTitle(`📅 Your Upcoming Events (Next ${VIEW_WINDOW_DAYS} Days)`)
      .setDescription(
        `Showing next ${shown.length} event(s) across **${user.calendars.length || 1} calendar(s)**:`,
      )
      .setFooter({ text: 'Auto-syncs live with Google Calendar' });

    for (const ev of shown) {
      const start = toUnix(ev.start);
      const end = toUnix(ev.end);
      const timeDisplay = ev.isAllDay
        ? `<t:${start}:D> (All day)`
        : `<t:${start}:F> to <t:${end}:t> (<t:${start}:R>)`;
      const calTag = ev.calendarName ? ` • *${ev.calendarName}*` : '';

      embed.addFields({
        name: truncate(`${ev.title}${calTag}`),
        value: truncate(
          `⏰ ${timeDisplay}${ev.location ? `\n📍 ${ev.location}` : ''}`,
          1024,
        ),
      });
    }

    return interaction.editReply({
      embeds: [embed],
      components: [openCalendarRow()],
    });
  } catch (err) {
    console.error('Failed to load events for /cal view:', err);
    return interaction.editReply({
      content: '❌ Error loading events. Please try again shortly.',
    });
  }
}
