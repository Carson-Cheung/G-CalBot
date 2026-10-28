import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';

/**
 * Stateless pagination: everything a page needs lives in the component custom ID,
 * so buttons keep working after a restart.
 *
 * Button: `pg|<kind>|<ownerId>|<page>|<filter>|<extra>|<slot>`
 * Select: `pgs|<kind>|<ownerId>|<extra>` (the chosen value is the filter, page resets to 0)
 */
const SEP = '|';
const BUTTON_PREFIX = `pg${SEP}`;
const SELECT_PREFIX = `pgs${SEP}`;
const MAX_SELECT_OPTIONS = 25;

export interface PagerState {
  kind: string;
  ownerId: string;
  page: number;
  filter: string;
  extra: string;
}

export interface PagerOption {
  value: string;
  label: string;
  description?: string;
  emoji?: string;
}

export interface PagerPayload {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
}

export function isPagerId(customId: string): boolean {
  return customId.startsWith(BUTTON_PREFIX) || customId.startsWith(SELECT_PREFIX);
}

export function parsePagerId(customId: string, selectedValue?: string): PagerState | null {
  const parts = customId.split(SEP);
  if (parts[0] === 'pg' && parts.length === 7) {
    const [, kind, ownerId, page, filter, extra] = parts;
    return { kind: kind!, ownerId: ownerId!, page: Number(page) || 0, filter: filter!, extra: extra! };
  }
  if (parts[0] === 'pgs' && parts.length === 4) {
    const [, kind, ownerId, extra] = parts;
    return { kind: kind!, ownerId: ownerId!, page: 0, filter: selectedValue ?? '', extra: extra! };
  }
  return null;
}

export function clampPage(page: number, total: number): number {
  return Math.min(Math.max(Math.trunc(page), 0), Math.max(total - 1, 0));
}

function navButton(state: PagerState, target: number, slot: string, label: string, disabled: boolean) {
  const id = [BUTTON_PREFIX + state.kind, state.ownerId, target, state.filter, state.extra, slot].join(SEP);
  return new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(disabled);
}

/**
 * Builds the dropdown (when options are given) and the « ‹ › » row, and stamps
 * "Page X of Y" into the embed footer.
 */
export function buildPager(
  embed: EmbedBuilder,
  state: PagerState,
  total: number,
  options: {
    select?: { placeholder: string; options: PagerOption[] };
    footerNote?: string;
    extraButtons?: ButtonBuilder[];
  } = {},
): PagerPayload {
  const pageCount = Math.max(total, 1);
  const page = clampPage(state.page, pageCount);
  const current = { ...state, page };
  const pageLabel = `Page ${page + 1} of ${pageCount}`;
  embed.setFooter({ text: options.footerNote ? `${pageLabel} • ${options.footerNote}` : pageLabel });

  const components: PagerPayload['components'] = [];

  if (options.select && options.select.options.length > 1) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId([SELECT_PREFIX + state.kind, state.ownerId, state.extra].join(SEP))
      .setPlaceholder(options.select.placeholder)
      .addOptions(
        options.select.options.slice(0, MAX_SELECT_OPTIONS).map((opt) => {
          const option = new StringSelectMenuOptionBuilder()
            .setLabel(opt.label.slice(0, 100))
            .setValue(opt.value)
            .setDefault(opt.value === state.filter);
          if (opt.description) option.setDescription(opt.description.slice(0, 100));
          if (opt.emoji) option.setEmoji(opt.emoji);
          return option;
        }),
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  }

  const atStart = page === 0;
  const atEnd = page >= pageCount - 1;
  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      navButton(current, 0, 'f', '«', atStart),
      navButton(current, page - 1, 'p', '‹', atStart),
      navButton(current, page + 1, 'n', '›', atEnd),
      navButton(current, pageCount - 1, 'l', '»', atEnd),
    ),
  );

  if (options.extraButtons?.length) {
    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(options.extraButtons));
  }

  return { embeds: [embed], components };
}
