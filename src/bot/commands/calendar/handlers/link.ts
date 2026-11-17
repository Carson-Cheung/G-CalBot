import { ChatInputCommandInteraction, EmbedBuilder, escapeMarkdown } from 'discord.js';
import { CalendarSyncService } from '../../../../calendar/syncService';
import { ReminderEngine } from '../../../../calendar/reminderEngine';
import { MAX_CALENDARS_PER_USER } from '../../../../config';
import { formatDurationMinutes } from '../../../../utils/time';
import { storage } from '../../../../db/storage';
import {
  DEFAULT_REMINDER_MINUTES,
  EMBED_COLORS,
  LINK_PREVIEW_EVENTS,
  VIEW_WINDOW_DAYS,
} from '../../../const';
import { EPHEMERAL, toUnix, truncate } from '../../../helpers';

export async function handleLink(
  interaction: ChatInputCommandInteraction,
  reminderEngine: ReminderEngine,
) {
  const userId = interaction.user.id;
  await interaction.deferReply({ flags: EPHEMERAL });
  const rawUrl = interaction.options.getString('url', true);
  const customName = interaction.options.getString('name')?.trim() || undefined;
  const cleanUrl = CalendarSyncService.sanitizeUrl(rawUrl);

  if (!/^https?:\/\//i.test(cleanUrl)) {
    return interaction.editReply({
      content:
        '❌ Invalid calendar link or ID. Please provide your Google Calendar Secret iCal URL, Public Embed link, or Calendar ID.',
    });
  }

  const limitMessage = `❌ You can link up to ${MAX_CALENDARS_PER_USER} calendars. Use \`/cal unlink\` to remove one first.`;
  if (storage.isAtCalendarLimit(userId, cleanUrl)) {
    return interaction.editReply({ content: limitMessage });
  }
  const nameProblem = customName && storage.calendarNameProblem(userId, customName, cleanUrl);
  if (nameProblem) {
    return interaction.editReply({ content: `❌ ${nameProblem}` });
  }

  try {
    // Fetching first validates the link before anything is stored.
    const events = await CalendarSyncService.fetchUpcomingEvents(
      cleanUrl,
      VIEW_WINDOW_DAYS,
      customName,
    );

    // Checked again because another /cal link may have finished while this feed was downloading.
    if (storage.isAtCalendarLimit(userId, cleanUrl)) {
      return interaction.editReply({ content: limitMessage });
    }

    const linked = storage.addCalendar(
      userId,
      customName,
      cleanUrl,
      storage.getUser(userId)?.reminderMinutes ?? DEFAULT_REMINDER_MINUTES,
    );
    reminderEngine.invalidateUserCache(userId);

    const user = storage.getUser(userId)!;
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.GOOGLE_GREEN)
      .setTitle('✅ Calendar Connected Successfully!')
      .setDescription(
        `Connected **${escapeMarkdown(linked.name)}**!\n` +
          `Found **${events.length} event(s)** in this calendar for the next ${VIEW_WINDOW_DAYS} days.\n` +
          `You now have **${user.calendars.length} connected calendar(s)**.\n` +
          (user.reminderMinutes === 0
            ? 'Reminders will be sent when each event **starts**.\n\n'
            : `Reminders will be sent **${formatDurationMinutes(user.reminderMinutes)}** before each event.\n\n`) +
          '⚠️ *Disclaimer: Data in calendar entries (event titles, descriptions, and locations) can be visible in Discord—please keep this in mind when using public commands like `/cal share`.*',
      );

    if (events.length > 0) {
      const previewList = events
        .slice(0, LINK_PREVIEW_EVENTS)
        .map((e) => `• **${escapeMarkdown(e.title)}** (<t:${toUnix(e.start)}:R>)`)
        .join('\n');
      embed.addFields({
        name: 'Upcoming Preview',
        value: truncate(previewList, 1024),
      });
    }

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    // The error text may echo the secret feed URL, so it is redacted.
    const message = err instanceof Error ? err.message : 'Unknown error';
    const safeMessage = message
      .split(cleanUrl)
      .join('[link]')
      .split(rawUrl)
      .join('[link]');
    return interaction.editReply({
      content: `❌ Could not connect calendar: ${truncate(safeMessage, 500)}\n\nPlease check the link or use \`/cal guide\` for assistance.`,
    });
  }
}
