export const COMMAND_NAMES = {
  CALENDAR: 'calendar',
  CAL: 'cal',
  DASHBOARD: 'dashboard',
  DASH: 'dash',
  ACT: 'act',
  OPEN: 'open',
  O: 'o',
  COMMANDS: 'commands',
  COMMS: 'comms',
} as const;

export const EMBED_COLORS = {
  GOOGLE_BLUE: 0x4285f4,
  GOOGLE_GREEN: 0x34a853,
  DISCORD_BLURPLE: 0x5865f2,
} as const;

export const DEFAULT_TIMEZONE = 'America/New_York';
export const DEFAULT_REMINDER_MINUTES = 10;
export const DEFAULT_DIGEST_TIME = '08:00';
export const GOOGLE_CALENDAR_URL = 'https://calendar.google.com';

export const VIEW_WINDOW_DAYS = 7;
export const LINK_PREVIEW_EVENTS = 3;

// Discord embed field names are capped at 256 characters.
export const EMBED_FIELD_NAME_MAX = 256;

// Guild install (0) and user install (1).
export const INTEGRATION_TYPES = [0, 1];
// Guild (0), bot DM (1) and private channel (2).
export const COMMAND_CONTEXTS = [0, 1, 2];
