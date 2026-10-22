import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
} from "discord.js";
import { ButtonStyle } from "discord-api-types/v10";
import { COMMANDS } from "../const";

export const openCommand = {
  data: new SlashCommandBuilder()
    .setName(COMMANDS.OPEN)
    .setDescription("Direct link to open Google Calendar")
    .setIntegrationTypes([0, 1]) // Available server-wide
    .setContexts([0, 1, 2]),

  async execute(interaction: ChatInputCommandInteraction) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("Open Google Calendar")
        .setStyle(ButtonStyle.Link)
        .setURL("https://calendar.google.com")
        .setEmoji("📅"),
    );

    return interaction.reply({
      content: "Click below to open Google Calendar:",
      components: [row],
      ephemeral: true, // only you see the message
    });
  },
};

//alias function
export const oCommand = {
  data: new SlashCommandBuilder()
    .setName(COMMANDS.O)
    .setDescription("Direct link to open Google Calendar")
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2]),
  execute: openCommand.execute, // Uses the same execute function!
};
