import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { EMBED_COLORS } from '../../../const';
import { EPHEMERAL, openCalendarRow } from '../../../helpers';

export async function handleGuide(interaction: ChatInputCommandInteraction) {
  const guideEmbed = new EmbedBuilder()
    .setColor(EMBED_COLORS.GOOGLE_BLUE)
    .setTitle('📖 How to get your Google Calendar Secret iCal Link')
    .setDescription(
      'Your link is completely private. Only the bot reads it to schedule your reminders.\n' +
        'No other Discord members or server admins will ever see your email or private calendar URL.\n\n' +
        '⚠️ **Disclaimer:** Information contained within calendar entries (such as event titles, descriptions, and locations) can be visible in Discord reminders and embeds.\n' +
        'Please keep this in mind when using public commands like `/cal share`.',
    )
    .addFields(
      {
        name: 'Step 1: Open Google Calendar on Desktop / Browser',
        value: 'Go to [calendar.google.com](https://calendar.google.com).',
      },
      {
        name: 'Step 2: Calendar Settings',
        value:
          'On the left sidebar under **My calendars**, hover over your calendar, click the three vertical dots (**⋮**), and select **Settings and sharing**.',
      },
      {
        name: 'Step 3: Find Secret Address',
        value:
          'Scroll down to the **Integrate calendar** section.\n' +
          'Look for **"Secret address in iCal format"** (do NOT use the Public address).\n' +
          'Click the copy button (Google may show a security prompt—this is normal).',
      },
      {
        name: 'Step 4: Link to Bot',
        value:
          'Type `/cal link url:<paste your link> name:<optional name>` here in Discord!',
      },
    )
    .setFooter({
      text: 'Tip: You can reset this secret link at any time in Google settings.',
    });

  return interaction.reply({
    embeds: [guideEmbed],
    components: [openCalendarRow()],
    flags: EPHEMERAL,
  });
}
