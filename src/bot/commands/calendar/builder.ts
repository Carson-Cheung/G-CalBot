import { SlashCommandBuilder } from "discord.js";

export function buildCalendarCommand(name: string) {
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
