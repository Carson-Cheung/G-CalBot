import type { CalendarFeed, CalendarTheme } from '../types';

const CALENDAR_THEMES: CalendarTheme[] = [
  { border: '#4285f4', bg: 'rgba(66, 133, 244, 0.12)', text: '#93c5fd', badgeBg: 'rgba(66, 133, 244, 0.2)', dot: '#3b82f6' },
  { border: '#5865f2', bg: 'rgba(88, 101, 242, 0.12)', text: '#c7d2fe', badgeBg: 'rgba(88, 101, 242, 0.2)', dot: '#6366f1' },
  { border: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', text: '#a7f3d0', badgeBg: 'rgba(16, 185, 129, 0.2)', dot: '#10b981' },
  { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', text: '#fde68a', badgeBg: 'rgba(245, 158, 11, 0.2)', dot: '#f59e0b' },
  { border: '#ec4899', bg: 'rgba(236, 72, 153, 0.12)', text: '#fbcfe8', badgeBg: 'rgba(236, 72, 153, 0.2)', dot: '#ec4899' },
  { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)', text: '#ddd6fe', badgeBg: 'rgba(139, 92, 246, 0.2)', dot: '#8b5cf6' },
];

export function getCalendarTheme(name?: string, calendars?: CalendarFeed[]): CalendarTheme {
  if (!name) return CALENDAR_THEMES[0];
  if (calendars && calendars.length > 0) {
    const target = name.trim().toLowerCase();
    const idx = calendars.findIndex(c => c.name.trim().toLowerCase() === target);
    if (idx !== -1) return CALENDAR_THEMES[idx % CALENDAR_THEMES.length];
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return CALENDAR_THEMES[Math.abs(hash) % CALENDAR_THEMES.length];
}
