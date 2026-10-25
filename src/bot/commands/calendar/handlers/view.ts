import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
} from "discord.js";
import { ButtonStyle } from "discord-api-types/v10";
import { storage } from "../../../../db/storage";
import { ReminderEngine } from "../../../../calendar/reminderEngine";
import { EMBED_COLORS } from "../../../const";

export async function handleView(
  interaction: ChatInputCommandInteraction,
  reminderEngine: ReminderEngine,
) {
  const userId = interaction.user.id;
  await interaction.deferReply({ ephemeral: true });
  const user = storage.getUser(userId);
  if (!user || (!user.calendars.length && !user.icalUrl)) {
    return interaction.editReply({
      content:
        "⚠️ You have not linked a calendar yet. Use `/cal link` or `/cal guide` to get started!",
    });
  }

  try {
    const events = await reminderEngine.getUserEvents(user, true);

    if (events.length === 0) {
      return interaction.editReply({
        content:
          "📅 No upcoming events found in your calendar(s) for the next 7 days.",
      });
    }

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.GOOGLE_BLUE)
      .setTitle("📅 Your Upcoming Events (Next 7 Days)")
      .setDescription(
        `Showing next ${Math.min(events.length, 10)} event(s) across **${user.calendars.length || 1} calendar(s)**:`,
      );

    for (const ev of events.slice(0, 10)) {
      const startUnix = Math.floor(ev.start.getTime() / 1000);
      const endUnix = Math.floor(ev.end.getTime() / 1000);
      const timeDisplay = ev.isAllDay
        ? `<t:${startUnix}:D> (All day)`
        : `<t:${startUnix}:F> to <t:${endUnix}:t> (<t:${startUnix}:R>)`;

      const calTag = ev.calendarName ? ` • *${ev.calendarName}*` : "";

      embed.addFields({
        name: `${ev.title}${calTag}`,
        value: `⏰ ${timeDisplay}${ev.location ? `\n📍 ${ev.location}` : ""}`,
      });
    }

    embed.setFooter({ text: "Auto-syncs live with Google Calendar" });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("Open Google Calendar")
        .setStyle(ButtonStyle.Link)
        .setURL("https://calendar.google.com")
        .setEmoji("📅"),
    );

    return interaction.editReply({ embeds: [embed], components: [row] });
  } catch (err: any) {
    return interaction.editReply({
      content: `❌ Error loading events: ${err.message}`,
    });
  }
}
