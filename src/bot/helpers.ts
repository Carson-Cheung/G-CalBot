import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { GOOGLE_CALENDAR_URL, EMBED_FIELD_NAME_MAX } from './const';
import { storage } from '../db/storage';

export const EPHEMERAL = MessageFlags.Ephemeral;

export function toUnix(date: Date | string | number): number {
  return Math.floor(new Date(date).getTime() / 1000);
}

export function truncate(text: string, max = EMBED_FIELD_NAME_MAX): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function openCalendarRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Open Google Calendar')
      .setStyle(ButtonStyle.Link)
      .setURL(GOOGLE_CALENDAR_URL)
      .setEmoji('📅'),
  );
}

export function hasLinkedCalendar(
  user: ReturnType<typeof storage.getUser>,
): user is NonNullable<typeof user> {
  return !!user && (user.calendars.length > 0 || !!user.icalUrl);
}

/** Replies or follows up depending on interaction state; never throws. */
export async function replyError(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<void> {
  try {
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({ content });
    } else if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, flags: EPHEMERAL });
    } else {
      await interaction.reply({ content, flags: EPHEMERAL });
    }
  } catch {
    // Interaction expired or was already answered; nothing more to do.
  }
}
