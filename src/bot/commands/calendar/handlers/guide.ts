import { ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { config } from '../../../../config';
import { EMBED_COLORS, GOOGLE_CALENDAR_URL } from '../../../const';
import { EPHEMERAL } from '../../../helpers';
import { PagerPayload, PagerState, buildPager, clampPage } from '../../../pager';

export const GUIDE_PAGER_KIND = 'g';

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

export function renderGuidePage(state: PagerState): PagerPayload {
  const index = clampPage(state.page, STEPS.length);
  const step = STEPS[index]!;
  const isLast = index === STEPS.length - 1;

  const embed = new EmbedBuilder()
    .setColor(isLast ? EMBED_COLORS.GOOGLE_GREEN : EMBED_COLORS.GOOGLE_BLUE)
    .setAuthor({ name: '📖 Calendar setup guide' })
    .setTitle(step.title)
    .setDescription(step.body);
  if (step.image) embed.setImage(imageUrl(step.image));

  const extraButtons =
    index === 1
      ? [
          new ButtonBuilder()
            .setLabel('Open Google Calendar')
            .setEmoji('📅')
            .setStyle(ButtonStyle.Link)
            .setURL(GOOGLE_CALENDAR_URL),
        ]
      : [];

  return buildPager(embed, { ...state, page: index, filter: String(index) }, STEPS.length, {
    select: {
      placeholder: 'Jump to a step',
      options: STEPS.map((s, i) => ({ value: String(i), label: `${i + 1}. ${s.title}` })),
    },
    extraButtons,
  });
}

export async function handleGuide(interaction: ChatInputCommandInteraction) {
  const page = renderGuidePage({
    kind: GUIDE_PAGER_KIND,
    ownerId: interaction.user.id,
    page: 0,
    filter: '0',
    extra: '',
  });
  return interaction.reply({ ...page, flags: EPHEMERAL });
}
