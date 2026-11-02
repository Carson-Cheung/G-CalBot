/** Google Calendar's calendar color palette, keyed by a stable id that is stored per linked calendar. */
export interface CalendarColor {
  key: string;
  name: string;
  hex: string;
  emoji: string;
}

export const CALENDAR_COLORS: readonly CalendarColor[] = [
  { key: 'tomato', name: 'Tomato', hex: '#d50000', emoji: '🟥' },
  { key: 'flamingo', name: 'Flamingo', hex: '#e67c73', emoji: '🟥' },
  { key: 'tangerine', name: 'Tangerine', hex: '#f4511e', emoji: '🟧' },
  { key: 'banana', name: 'Banana', hex: '#f6bf26', emoji: '🟨' },
  { key: 'sage', name: 'Sage', hex: '#33b679', emoji: '🟩' },
  { key: 'basil', name: 'Basil', hex: '#0b8043', emoji: '🟩' },
  { key: 'peacock', name: 'Peacock', hex: '#039be5', emoji: '🟦' },
  { key: 'blueberry', name: 'Blueberry', hex: '#3f51b5', emoji: '🟦' },
  { key: 'lavender', name: 'Lavender', hex: '#7986cb', emoji: '🟪' },
  { key: 'grape', name: 'Grape', hex: '#8e24aa', emoji: '🟪' },
  { key: 'graphite', name: 'Graphite', hex: '#616161', emoji: '⬛' },
];

export const DEFAULT_CALENDAR_COLOR_KEY = 'peacock';

export function findCalendarColor(key: string | undefined): CalendarColor | undefined {
  return key ? CALENDAR_COLORS.find((color) => color.key === key) : undefined;
}

/** The chosen color, or Google's default blue when none was picked. */
export function resolveCalendarColor(key: string | undefined): CalendarColor {
  return findCalendarColor(key) ?? findCalendarColor(DEFAULT_CALENDAR_COLOR_KEY)!;
}

export function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}
