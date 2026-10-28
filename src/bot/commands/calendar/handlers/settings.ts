import { ChatInputCommandInteraction } from 'discord.js';
import { MAX_REMINDER_MINUTES } from '../../../../config';
import { storage } from '../../../../db/storage';
import { formatDurationMinutes, parseDurationMinutes } from '../../../../utils/time';
import { EPHEMERAL } from '../../../helpers';

function describeLead(minutes: number): string {
  return minutes === 0 ? 'when each event **starts**' : `**${formatDurationMinutes(minutes)}** before each event`;
}

export async function handleSettings(interaction: ChatInputCommandInteraction) {
  const user = storage.getUser(interaction.user.id);
  if (!user) {
    return interaction.reply({
      content: '⚠️ You have not linked a calendar yet. Use `/cal link` first!',
      flags: EPHEMERAL,
    });
  }

  const input = interaction.options.getString('remind_before');
  if (!input) {
    return interaction.reply({
      content: `🔔 Reminders currently arrive ${describeLead(user.reminderMinutes)}.\nChange it with \`/cal settings remind_before:\` followed by a time like \`45m\`, \`2h\` or \`1d\`.`,
      flags: EPHEMERAL,
    });
  }

  const minutes = parseDurationMinutes(input);
  if (minutes === null || minutes > MAX_REMINDER_MINUTES) {
    return interaction.reply({
      content:
        minutes === null
          ? `❌ I couldn't read \`${input}\`. Use minutes, hours or days, like \`10m\`, \`2h\`, \`1h30m\` or \`1d\`.`
          : `❌ Reminders can be at most **7 days** before an event.`,
      flags: EPHEMERAL,
    });
  }

  user.reminderMinutes = minutes;
  user.updatedAt = new Date().toISOString();
  storage.saveUser(user);

  return interaction.reply({
    content: `✅ Reminders will now arrive ${describeLead(minutes)}.`,
    flags: EPHEMERAL,
  });
}
