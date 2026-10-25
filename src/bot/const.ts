// Constants for slash command identifiers

export const COMMAND_NAMES = {
  CALENDAR: 'calendar',
  CAL: 'cal',
  DASHBOARD: 'dashboard',
  DASH: 'dash',
  ACT: 'act',
  OPEN: 'open',
  O: 'o',
} as const;

export const EMBED_COLORS = {
  GOOGLE_BLUE: 0x4285f4,
  GOOGLE_GREEN: 0x34a853,
  DISCORD_BLURPLE: 0x5865f2,
  WARNING: 0xfbbc05,
  ERROR: 0xea4335,
} as const;

export const DEFAULT_TIMEZONE = 'America/New_York';

// Backwards compatibility aliases
export const COMMANDS = COMMAND_NAMES;
export type CommandName = (typeof COMMAND_NAMES)[keyof typeof COMMAND_NAMES];
