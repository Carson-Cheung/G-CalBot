import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
} from "discord.js";
import { ButtonStyle } from "discord-api-types/v10";
import { config } from "../../config";
import { COMMAND_NAMES, EMBED_COLORS } from "../const";
import { createSessionToken } from "../../utils/session";

function buildDashboardCommand(name: string) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription("Open the interactive Google Calendar Activity dashboard")
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2]);
}

export const dashboardCommand = {
  data: buildDashboardCommand(COMMAND_NAMES.DASHBOARD),

  async execute(interaction: ChatInputCommandInteraction) {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.DISCORD_BLURPLE) // Discord Blurple
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

    if (!config.clientId) {
      return interaction.reply({
        content: "⚠️ Activity dashboard is unavailable: `DISCORD_CLIENT_ID` is not configured.",
        ephemeral: true,
      });
    }

    const userProfile = {
      userId: interaction.user.id,
      username: interaction.user.displayName || interaction.user.username,
      avatarUrl: interaction.user.displayAvatarURL({ size: 128 }),
    };

    const sessionToken = createSessionToken(userProfile);
    const webDashboardUrl = `${config.publicUrl.replace(/\/$/, '')}/?session=${encodeURIComponent(sessionToken)}`;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("🚀 Launch in Discord")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/activities/${config.clientId}`),
      new ButtonBuilder()
        .setLabel("🌐 Open Personal Web Dashboard")
        .setStyle(ButtonStyle.Link)
        .setURL(webDashboardUrl),
    );

    return interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
    });
  },
};

export const dashCommand = {
  data: buildDashboardCommand(COMMAND_NAMES.DASH),
  execute: dashboardCommand.execute,
};

export const actCommand = {
  data: buildDashboardCommand(COMMAND_NAMES.ACT),
  execute: dashboardCommand.execute,
};

// Backwards compatibility alias
export const activityCommand = dashboardCommand;
