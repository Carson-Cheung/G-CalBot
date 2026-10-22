import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
} from "discord.js";
import { ButtonStyle } from "discord-api-types/v10";
import { config } from "../../config";
import { COMMANDS } from "../const";

function buildActivityCommand(name: string) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription("Open the interactive Google Calendar Activity dashboard")
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2]);
}

export const activityCommand = {
  data: buildActivityCommand(COMMANDS.ACTIVITY),

  async execute(interaction: ChatInputCommandInteraction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2) // Discord Blurple
      .setTitle("📱 Google Calendar Activity & Dashboard")
      .setDescription(
        "Launch the Google Calendar Activity inside Discord to view your calendar schedule, manage reminders, and customize your sync settings!",
      )
      .addFields(
        {
          name: "🚀 Launch in Voice / Text Channel",
          value:
            "Click the **Activities (Rocket 🚀)** icon in any Discord channel and select this App!",
        },
        {
          name: "🔒 Privacy Guaranteed",
          value:
            "Your private Google link is securely managed and never visible to other members.",
        },
      );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("Launch Activity")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/activities/${config.clientId}`),
    );

    return interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
    });
  },
};

export const actCommand = {
  data: buildActivityCommand(COMMANDS.ACT),
  execute: activityCommand.execute,
};
