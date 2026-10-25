import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { CalendarSyncService } from "../../../../calendar/syncService";
import { ReminderEngine } from "../../../../calendar/reminderEngine";
import { storage } from "../../../../db/storage";
import { EMBED_COLORS } from "../../../const";

export async function handleLink(
  interaction: ChatInputCommandInteraction,
  reminderEngine: ReminderEngine,
) {
  const userId = interaction.user.id;
  await interaction.deferReply({ ephemeral: true });
  const rawUrl = interaction.options.getString("url", true);
  const customName = interaction.options.getString("name");
  const cleanUrl = CalendarSyncService.sanitizeUrl(rawUrl);

  if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
    return interaction.editReply({
      content:
        "❌ Invalid URL. Please provide a valid HTTP/HTTPS link to your iCal feed.",
    });
  }

  try {
    // Validate by fetching events from this link
    const events = await CalendarSyncService.fetchUpcomingEvents(
      cleanUrl,
      7,
      customName || undefined,
    );

    const existing = storage.getUser(userId);
    const defaultName =
      customName ||
      (existing && existing.calendars.length > 0
        ? `Calendar ${existing.calendars.length + 1}`
        : "Primary");

    const linked = storage.addCalendar(
      userId,
      defaultName,
      cleanUrl,
      existing?.reminderMinutes ?? 10,
    );
    reminderEngine.invalidateUserCache(userId);

    const user = storage.getUser(userId)!;
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.GOOGLE_GREEN)
      .setTitle("✅ Calendar Connected Successfully!")
      .setDescription(
        `Connected **${linked.name}**!\n` +
          `Found **${events.length} event(s)** in this calendar for the next 7 days.\n` +
          `You now have **${user.calendars.length} connected calendar(s)**.\n` +
          `Reminders will be sent **${user.reminderMinutes} minutes** before each event.\n\n` +
          `⚠️ *Disclaimer: Data in calendar entries (event titles, descriptions, and locations) can be visible in Discord—please keep this in mind when using public commands like \`/cal share\`.*`,
      );

    if (events.length > 0) {
      const previewList = events
        .slice(0, 3)
        .map(
          (e) =>
            `• **${e.title}** (<t:${Math.floor(e.start.getTime() / 1000)}:R>)`,
        )
        .join("\n");
      embed.addFields({ name: "Upcoming Preview", value: previewList });
    }

    return interaction.editReply({ embeds: [embed] });
  } catch (err: any) {
    return interaction.editReply({
      content: `❌ Could not connect calendar: ${err.message || "Unknown error"}\n\nPlease check the link or use \`/cal guide\` for assistance.`,
    });
  }
}
