import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
} from "discord.js";
import { ButtonStyle } from "discord-api-types/v10";
import { storage } from "../../db/storage";
import { CalendarSyncService } from "../../calendar/syncService";
import { ReminderEngine } from "../../calendar/reminderEngine";
import { COMMANDS } from "../const";

function buildCalendarCommand(name: string) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription("Manage your Google Calendar reminders and sync")
    .setIntegrationTypes([0, 1]) // 0 = GuildInstall (Server-wide for all members), 1 = UserInstall
    .setContexts([0, 1, 2]) // 0 = Guild, 1 = BotDM, 2 = PrivateChannel
    .addSubcommand((sub) =>
      sub
        .setName("link")
        .setDescription("Privately link a Google Calendar secret iCal URL")
        .addStringOption((opt) =>
          opt
            .setName("url")
            .setDescription(
              "The Secret address in iCal format from Google Calendar settings",
            )
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription(
              "Optional name for this calendar (e.g. Crow, Family, Work)",
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("View all of your connected Google Calendars"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("unlink")
        .setDescription("Unlink a specific calendar or all calendars")
        .addStringOption((opt) =>
          opt
            .setName("calendar")
            .setDescription(
              "Calendar name/ID to remove (leave blank to unlink all)",
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("view").setDescription("View your upcoming calendar events"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("settings")
        .setDescription("Customize reminder alert timing")
        .addIntegerOption((opt) =>
          opt
            .setName("remind_before")
            .setDescription("Minutes before event to receive Discord DM alert")
            .setRequired(true)
            .addChoices(
              { name: "At event start (0 mins)", value: 0 },
              { name: "5 minutes before", value: 5 },
              { name: "10 minutes before (Default)", value: 10 },
              { name: "15 minutes before", value: 15 },
              { name: "30 minutes before", value: 30 },
              { name: "1 hour before", value: 60 },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("test")
        .setDescription("Send an immediate test reminder DM to your account"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("guide")
        .setDescription("How to get your private Google Calendar iCal link"),
    )

    .addSubcommand((sub) =>
      sub
        .setName("share")
        .setDescription(
          "Post your schedule publicly in this channel for others to see",
        )
        .addStringOption((opt) =>
          opt
            .setName("until")
            .setDescription("e.g. tdy, tmr, 3d, 5d, 2w")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("daily")
        .setDescription(
          "Configure a daily morning briefing of all your tasks for today",
        )
        .addStringOption((opt) =>
          opt
            .setName("time")
            .setDescription("Time to send your daily digest (e.g. 08:30)")
            .setRequired(false),
        )
        .addBooleanOption((opt) =>
          opt
            .setName("enabled")
            .setDescription("Turn your daily morning digest on or off")
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName("timezone")
            .setDescription(
              "Your timezone (e.g. America/Toronto, EST, PST, UTC)",
            )
            .setRequired(false),
        )
        .addBooleanOption((opt) =>
          opt
            .setName("test")
            .setDescription(
              "Send today's daily briefing to your DMs right now to test",
            )
            .setRequired(false),
        ),
    );
}

export const calendarCommand = {
  data: buildCalendarCommand(COMMANDS.CALENDAR),

  async execute(
    interaction: ChatInputCommandInteraction,
    reminderEngine: ReminderEngine,
  ) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // Handle Guide
    if (subcommand === "guide") {
      const guideEmbed = new EmbedBuilder()
        .setColor(0x4285f4)
        .setTitle("📖 How to get your Google Calendar Secret iCal Link")
        .setDescription(
          "Your link is completely private. Only the bot reads it to schedule your reminders.\n" +
            "No other Discord members or server admins will ever see your email or private calendar URL.\n\n" +
            "⚠️ **Disclaimer:** Information contained within calendar entries (such as event titles, descriptions, and locations) can be visible in Discord reminders and embeds—please keep this in mind when using public commands like `/cal share`.",
        )
        .addFields(
          {
            name: "Step 1: Open Google Calendar on Desktop / Browser",
            value: "Go to [calendar.google.com](https://calendar.google.com).",
          },
          {
            name: "Step 2: Calendar Settings",
            value:
              "On the left sidebar under **My calendars**, hover over your calendar, click the three vertical dots (**⋮**), and select **Settings and sharing**.",
          },
          {
            name: "Step 3: Find Secret Address",
            value:
              "Scroll down to the **Integrate calendar** section.\n" +
              'Look for **"Secret address in iCal format"** (do NOT use the Public address).\n' +
              "Click the copy button.",
          },
          {
            name: "Step 4: Link to Bot",
            value:
              "Type `/cal link url:<paste your link> name:<optional name>` here in Discord!",
          },
        )
        .setFooter({
          text: "Tip: You can reset this secret link at any time in Google settings.",
        });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("Open Google Calendar")
          .setStyle(ButtonStyle.Link)
          .setURL("https://calendar.google.com")
          .setEmoji("📅"),
      );

      return interaction.reply({
        embeds: [guideEmbed],
        components: [row],
        ephemeral: true,
      });
    }

    // Handle Link (Supports Multi-Calendar!)
    if (subcommand === "link") {
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
          .setColor(0x34a853) // Google Green
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

    // Handle List
    if (subcommand === "list") {
      const user = storage.getUser(userId);
      if (!user || user.calendars.length === 0) {
        return interaction.reply({
          content:
            "ℹ️ You do not currently have any calendars linked. Use `/cal link` to add one!",
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x4285f4)
        .setTitle("📅 Your Connected Calendars")
        .setDescription(
          `You have **${user.calendars.length} calendar(s)** connected:`,
        );

      for (let i = 0; i < user.calendars.length; i++) {
        const cal = user.calendars[i];
        embed.addFields({
          name: `${i + 1}. ${cal.name}`,
          value: `🔗 ID: \`${cal.id}\`\n🕒 Added <t:${Math.floor(new Date(cal.addedAt).getTime() / 1000)}:R>`,
        });
      }

      embed.setFooter({
        text: "Use `/cal unlink calendar:<name>` to remove an individual calendar.",
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Handle Unlink
    if (subcommand === "unlink") {
      const calendarTarget = interaction.options.getString("calendar");
      const user = storage.getUser(userId);

      if (!user || user.calendars.length === 0) {
        return interaction.reply({
          content: "ℹ️ You do not currently have any calendars linked.",
          ephemeral: true,
        });
      }

      if (calendarTarget) {
        const removed = storage.removeCalendar(userId, calendarTarget);
        reminderEngine.invalidateUserCache(userId);

        if (removed) {
          return interaction.reply({
            content: `✅ Calendar **${calendarTarget}** has been removed.`,
            ephemeral: true,
          });
        } else {
          return interaction.reply({
            content: `⚠️ Could not find a calendar named \`${calendarTarget}\`. Use \`/cal list\` to view your calendars.`,
            ephemeral: true,
          });
        }
      } else {
        storage.deleteUser(userId);
        reminderEngine.invalidateUserCache(userId);
        return interaction.reply({
          content:
            "✅ All your connected Google Calendars have been unlinked and reminders disabled.",
          ephemeral: true,
        });
      }
    }

    // Handle Settings
    if (subcommand === "settings") {
      const user = storage.getUser(userId);
      if (!user) {
        return interaction.reply({
          content:
            "⚠️ You have not linked a calendar yet. Use `/cal link` first!",
          ephemeral: true,
        });
      }

      const remindBefore = interaction.options.getInteger(
        "remind_before",
        true,
      );
      user.reminderMinutes = remindBefore;
      user.updatedAt = new Date().toISOString();
      storage.saveUser(user);

      return interaction.reply({
        content: `✅ Reminder alert timing updated to **${remindBefore} minutes** before event start.`,
        ephemeral: true,
      });
    }

    // Handle View
    if (subcommand === "view") {
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
          .setColor(0x4285f4)
          .setTitle("📅 Your Upcoming Events (Next 7 Days)")
          .setDescription(
            `Showing next ${Math.min(events.length, 10)} event(s) across **${user.calendars.length || 1} calendar(s)**:`,
          );

        for (const ev of events.slice(0, 10)) {
          const startUnix = Math.floor(ev.start.getTime() / 1000);
          const endUnix = Math.floor(ev.end.getTime() / 1000);
          const timeDisplay = ev.isAllDay
            ? `<t:${startUnix}:D> (All day)`
            : `<t:${startUnix}:F> (<t:${startUnix}:R>)`;

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

    // Handle Test
    if (subcommand === "test") {
      await interaction.deferReply({ ephemeral: true });
      const testEvent = {
        id: `test_${Date.now()}`,
        title: "🎉 Google Calendar Reminder Test",
        description:
          "If you can read this, your Discord reminders are properly configured!",
        location: "Discord Direct Message",
        start: new Date(Date.now() + 10 * 60 * 1000),
        end: new Date(Date.now() + 40 * 60 * 1000),
        isAllDay: false,
        calendarName: "Test",
      };

      const success = await reminderEngine.sendReminder(userId, testEvent, 10);
      if (success) {
        return interaction.editReply({
          content:
            "📬 Test reminder DM sent! Check your direct messages from this bot.",
        });
      } else {
        return interaction.editReply({
          content:
            "⚠️ Failed to send test DM. Please check your Discord privacy settings:\n" +
            "Go to **User Settings > Privacy & Safety > Allow direct messages from server members**.",
        });
      }
    }
    if (subcommand === "share") {
      const user = storage.getUser(userId);
      if (!user || (!user.calendars.length && !user.icalUrl)) {
        return interaction.reply({
          content:
            "⚠️ You haven't linked a calendar yet! Use `/cal link` first.",
          ephemeral: true,
        });
      }
      await interaction.deferReply({ ephemeral: false });
      const tz = user.timezone || "America/Toronto";
      const until = (interaction.options.getString("until") || "3d")
        .toLowerCase()
        .trim();
      const now = new Date();
      let cutoff: Date;
      let timeLabel = "Next 3 Days";

      if (until === "tdy" || until === "today") {
        cutoff = CalendarSyncService.getTimezoneDayRange(now, 0, tz).end;
        timeLabel = "Rest of today";
      } else if (until === "tmr" || until === "tomorrow") {
        cutoff = CalendarSyncService.getTimezoneDayRange(now, 1, tz).end;
        timeLabel = "Tomorrow";
      } else if (until.match(/^(\d+)\s*w/)) {
        // regex pattern matching (looks for 'w') ^
        const weeks = parseInt(until.match(/^(\d+)/)![1], 10);
        cutoff = CalendarSyncService.getTimezoneDayRange(
          now,
          weeks * 7,
          tz,
        ).end;
        timeLabel = "Next " + weeks + " week(s)";
      } else if (until.match(/^(\d+)\s*d/)) {
        // regex pattern matching (looks for 'd') ^
        const days = parseInt(until.match(/^(\d+)/)![1], 10);
        cutoff = CalendarSyncService.getTimezoneDayRange(now, days, tz).end;
        timeLabel = "Next " + days + " day(s)";
      } else {
        // edge case where user puts random stuff
        cutoff = CalendarSyncService.getTimezoneDayRange(now, 3, tz).end;
        timeLabel = "Next 3 days";
      }

      const allEvents = await reminderEngine.getUserEvents(user, true);

      // only keep events between time range
      const sharedEvents = allEvents.filter(
        (e) =>
          e.start.getTime() <= cutoff.getTime() &&
          e.end.getTime() >= now.getTime(),
      );

      if (sharedEvents.length === 0) {
        return interaction.editReply({
          content: `📅 **${interaction.user.displayName}** has no events scheduled for **${timeLabel}** (completely free)!`,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2) // Discord Blurple
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

      embed.setFooter({
        text: "🔒 Privacy protected: Email & feed URLs are never shared. ⚠️ Keep in mind that calendar entry details (titles, times, locations) are visible to everyone in this channel.",
      });

      return interaction.editReply({ embeds: [embed] });
    }
    if (subcommand === "daily") {
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
        const timeMatch = timeInput.match(/^(\d{1,2}):(\d{2})$/);
        if (timeMatch) {
          const hh = timeMatch[1].padStart(2, "0");
          const mm = timeMatch[2];
          user.dailyDigestTime = `${hh}:${mm}`;
          user.dailyDigestEnabled = true;
          updated = true;
        } else {
          return interaction.editReply({
            content:
              "⚠️ Please enter a valid 24-hour time in `HH:mm` format (e.g. `08:00` or `09:30`).",
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
        user.timezone = tzInput;
        updated = true;
      }
      if (updated) {
        user.updatedAt = new Date().toISOString();
        storage.saveUser(user);
      }
      // 4. If user asked for an immediate test preview
      if (runTest) {
        const sent = await reminderEngine.sendDailyDigest(userId, true);
        if (sent) {
          return interaction.editReply({
            content: `📬 **Test daily briefing sent to your DMs!**\n\n⚙️ **Current Settings:**\n• Daily Digest: ${user.dailyDigestEnabled ? "✅ Active" : "❌ Disabled"}\n• Delivery Time: \`${user.dailyDigestTime || "08:00"}\`\n• Timezone: \`${user.timezone || "America/Toronto"}\``,
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
        content: `⚙️ **Daily Schedule Briefing Settings:**\n\n• Status: ${user.dailyDigestEnabled ? "✅ **Active**" : "❌ **Disabled**"}\n• Delivery Time: \`${user.dailyDigestTime || "08:00"}\` every morning\n• Timezone: \`${user.timezone || "America/Toronto"}\`\n\n*Tip: Run \`/cal daily test: True\` to preview today's briefing in your DMs right now!*`,
      });
    }
  },
};

// Alias export for /cal
export const calCommand = {
  data: buildCalendarCommand(COMMANDS.CAL),
  execute: calendarCommand.execute,
};
