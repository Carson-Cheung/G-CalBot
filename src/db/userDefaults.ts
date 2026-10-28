import { LinkedCalendar, UserCalendarConfig } from '../types';

export const DEMO_USER_ID = 'demo-user';

export function createDemoUser(): UserCalendarConfig {
  return {
    userId: DEMO_USER_ID,
    reminderMinutes: 10,
    enabled: true,
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
    calendars: [
      {
        id: 'demo_cal_f1',
        name: 'Formula 1 Schedule (Demo)',
        url: 'https://f1calendar.com/download/f1-calendar_p1_p2_p3_qualifying_sprint_gp.ics',
        addedAt: '2026-10-20T00:00:00.000Z',
      },
      {
        id: 'demo_cal_holidays',
        name: 'Canadian Holidays (Demo)',
        url: 'https://calendar.google.com/calendar/ical/en.canadian%23holiday%40group.v.calendar.google.com/public/basic.ics',
        addedAt: '2026-10-20T00:00:00.000Z',
      },
    ],
  };
}

/**
 * Calendars for a user, falling back to the single `icalUrl` field that
 * records written before multi-calendar support still carry.
 */
export function resolveUserCalendars(user: UserCalendarConfig): LinkedCalendar[] {
  if (user.calendars && user.calendars.length > 0) return user.calendars;
  if (!user.icalUrl) return [];
  return [
    {
      id: 'primary',
      name: 'Primary',
      url: user.icalUrl,
      addedAt: user.createdAt || new Date().toISOString(),
    },
  ];
}

/**
 * Ensures `user.calendars` is populated in place, so legacy records behave
 * like current ones everywhere they are read.
 */
export function normalizeUserCalendars(user: UserCalendarConfig): UserCalendarConfig {
  if (!user.calendars) {
    user.calendars = resolveUserCalendars(user);
  }
  return user;
}
