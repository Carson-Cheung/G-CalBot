import { ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';
import { ReminderEngine } from '../calendar/reminderEngine';
import { EPHEMERAL } from './helpers';
import { PagerPayload, PagerState, parsePagerId } from './pager';
import { GUIDE_PAGER_KIND, renderGuidePage } from './commands/calendar/handlers/guide';
import { VIEW_PAGER_KIND, renderViewPage } from './commands/calendar/handlers/view';
import { SHARE_PAGER_KIND, renderSharePage } from './commands/calendar/handlers/share';
import { COMMANDS_PAGER_KIND, renderCommandsPage } from './commands/commandsList';

// Dropdowns on these kinds pick a page directly instead of filtering.
const SELECT_PICKS_PAGE = new Set([GUIDE_PAGER_KIND, COMMANDS_PAGER_KIND]);

export async function handlePagerInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  reminderEngine: ReminderEngine,
): Promise<void> {
  const selected = interaction.isStringSelectMenu() ? interaction.values[0] : undefined;
  const state = parsePagerId(interaction.customId, selected);
  if (!state) return;

  if (state.ownerId !== interaction.user.id) {
    await interaction.reply({
      content: 'These buttons belong to whoever ran the command. Run it yourself to get your own.',
      flags: EPHEMERAL,
    });
    return;
  }

  if (interaction.isStringSelectMenu() && SELECT_PICKS_PAGE.has(state.kind)) {
    state.page = Number(state.filter) || 0;
  }

  // Event pages may refetch feeds, which can outlast Discord's 3-second window.
  await interaction.deferUpdate();

  let result: PagerPayload | string | null;
  try {
    result = await renderPage(state, interaction, reminderEngine);
  } catch (err) {
    console.error('Failed to render page:', err);
    await interaction.followUp({
      content: '❌ Could not load that page. Please try again shortly.',
      flags: EPHEMERAL,
    });
    return;
  }
  if (!result) return;

  await interaction.editReply(
    typeof result === 'string' ? { content: result, embeds: [], components: [] } : result,
  );
}

// Page presses read the cached feed; only the original command forces a refetch.
async function renderPage(
  state: PagerState,
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  reminderEngine: ReminderEngine,
): Promise<PagerPayload | string | null> {
  switch (state.kind) {
    case GUIDE_PAGER_KIND:
      return renderGuidePage(state);
    case COMMANDS_PAGER_KIND:
      return renderCommandsPage(state);
    case VIEW_PAGER_KIND:
      return renderViewPage(state, reminderEngine, false);
    case SHARE_PAGER_KIND:
      return renderSharePage(state, interaction.user, reminderEngine, false);
    default:
      return null;
  }
}
