import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { config } from '../../../../config';
import { EMBED_COLORS, GOOGLE_CALENDAR_URL } from '../../../const';
import { EPHEMERAL } from '../../../helpers';

export const GUIDE_BUTTON_PREFIX = 'guide:';

// Bump after replacing a screenshot: Discord caches embed images by URL.
const IMAGE_VERSION = 1;

interface GuideStep {
  title: string;
  body: string;
  image?: string;
}

const STEPS: GuideStep[] = [
  {
    title: 'Before you start',
    body:
      "You'll copy your calendar's **secret iCal address** and give it to the bot. It takes about a minute.\n\n" +
      'The link stays private. Only the bot reads it, and no other Discord member or server admin will see it or your email.\n\n' +
      '⚠️ Event titles, descriptions and locations can appear in reminders, and in chat if you use public commands like `/cal share`.',
  },
  {
    title: 'Open Google Calendar',
    body:
      'Open [calendar.google.com](https://calendar.google.com) in a browser on a computer.\n\n' +
      "The phone app doesn't show the secret address, so use a desktop browser.",
    image: 'step-1.png',
  },
  {
    title: 'Open the calendar menu',
    body:
      'In the left sidebar under **My calendars**, hover over the calendar you want and click the three dots (**⋮**) next to it.',
    image: 'step-2.png',
  },
  {
    title: 'Go to settings',
    body: 'In the menu that opens, click **Settings and sharing**.',
    image: 'step-3.png',
  },
  {
    title: 'Find "Integrate calendar"',
    body: 'Scroll down the settings page until you reach the **Integrate calendar** section.',
    image: 'step-4.png',
  },
  {
    title: 'Copy the secret address',
    body:
      'Find **Secret address in iCal format** and click its copy button.\n\n' +
      "Don't use the **Public address**; it only works for public calendars. " +
      'Google may show a security warning first. That is normal.',
    image: 'step-5.png',
  },
  {
    title: 'Link it to the bot',
    body:
      'Back in Discord, run:\n`/cal link url:<paste your link> name:<optional name>`\n\n' +
      'The bot checks the link and shows your next few events.',
    image: 'step-6.png',
  },
  {
    title: "You're all set",
    body:
      "You'll get a DM before each event. Try these next:\n" +
      '• `/cal view`: see your upcoming events\n' +
      '• `/cal settings`: change how early reminders arrive\n' +
      '• `/cal daily`: get a morning summary of your day\n\n' +
      'If your link ever leaks, reset the secret address in Google Calendar settings and link the new one.',
  },
];

function imageUrl(file: string): string {
  return `${config.publicUrl.replace(/\/$/, '')}/guide/${file}?v=${IMAGE_VERSION}`;
}

function renderStep(index: number) {
  const step = STEPS[index]!;
  const isFirst = index === 0;
  const isLast = index === STEPS.length - 1;

  const embed = new EmbedBuilder()
    .setColor(isLast ? EMBED_COLORS.GOOGLE_GREEN : EMBED_COLORS.GOOGLE_BLUE)
    .setAuthor({ name: '📖 Calendar setup guide' })
    .setTitle(step.title)
    .setDescription(step.body)
    .setFooter({ text: `Step ${index + 1} of ${STEPS.length}` });
  if (step.image) embed.setImage(imageUrl(step.image));

  const row = new ActionRowBuilder<ButtonBuilder>();
  if (!isFirst) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${GUIDE_BUTTON_PREFIX}${index - 1}`)
        .setLabel('Back')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (!isLast) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${GUIDE_BUTTON_PREFIX}${index + 1}`)
        .setLabel(isFirst ? 'Start' : 'Next')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Primary),
    );
  }
  if (index === 1) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel('Open Google Calendar')
        .setEmoji('📅')
        .setStyle(ButtonStyle.Link)
        .setURL(GOOGLE_CALENDAR_URL),
    );
  }

  return { embeds: [embed], components: [row] };
}

export async function handleGuide(interaction: ChatInputCommandInteraction) {
  return interaction.reply({ ...renderStep(0), flags: EPHEMERAL });
}

export async function handleGuideButton(interaction: ButtonInteraction) {
  const requested = Number(interaction.customId.slice(GUIDE_BUTTON_PREFIX.length));
  const index = Number.isInteger(requested)
    ? Math.min(Math.max(requested, 0), STEPS.length - 1)
    : 0;
  return interaction.update(renderStep(index));
}
