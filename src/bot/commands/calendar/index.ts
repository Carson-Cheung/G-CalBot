import { ChatInputCommandInteraction } from "discord.js";
import { ReminderEngine } from "../../../calendar/reminderEngine";
import { COMMAND_NAMES } from "../../const";
import { buildCalendarCommand } from "./builder";
import { handleGuide } from "./handlers/guide";
import { handleLink } from "./handlers/link";
import { handleList } from "./handlers/list";
import { handleUnlink } from "./handlers/unlink";
import { handleSettings } from "./handlers/settings";
import { handleView } from "./handlers/view";
import { handleTest } from "./handlers/test";
import { handleShare } from "./handlers/share";
import { handleDaily } from "./handlers/daily";

async function executeCalendar(
  interaction: ChatInputCommandInteraction,
  reminderEngine: ReminderEngine,
) {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "guide":
      return handleGuide(interaction);
    case "link":
      return handleLink(interaction, reminderEngine);
    case "list":
      return handleList(interaction);
    case "unlink":
      return handleUnlink(interaction, reminderEngine);
    case "settings":
      return handleSettings(interaction);
    case "view":
      return handleView(interaction, reminderEngine);
    case "test":
      return handleTest(interaction, reminderEngine);
    case "share":
      return handleShare(interaction, reminderEngine);
    case "daily":
      return handleDaily(interaction, reminderEngine);
    default:
      return interaction.reply({
        content: `Unknown subcommand: ${subcommand}`,
        ephemeral: true,
      });
  }
}

export const calendarCommand = {
  data: buildCalendarCommand(COMMAND_NAMES.CALENDAR),
  execute: executeCalendar,
};

export const calCommand = {
  data: buildCalendarCommand(COMMAND_NAMES.CAL),
  execute: executeCalendar,
};
