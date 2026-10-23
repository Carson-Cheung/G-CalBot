export interface LinkedCalendar {
  id: string;
  name: string;
  url: string;
  addedAt: string;
}

export interface UserCalendarConfig {
  userId: string;
  icalUrl?: string; // backwards compatibility
  calendars: LinkedCalendar[];
  reminderMinutes: number; // e.g. 10 (minutes before start)
  enabled: boolean;
  timezone?: string;
  dailyDigestEnabled?: boolean;
  dailyDigestTime?: string;
  lastDailyDigestDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  calendarName?: string;
  htmlLink?: string;
}

export interface UserSettingsUpdate {
  reminderMinutes?: number;
  enabled?: boolean;
}
