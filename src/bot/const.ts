// Constants for slash command identifiers

export const COMMANDS = {
  CAL: "cal",
  CALENDAR: "calendar",
  ACTIVITY: "activity",
  ACT: "act",
  OPEN: "open",
  O: "o",
} as const;

export type CommandName = (typeof COMMANDS)[keyof typeof COMMANDS];
