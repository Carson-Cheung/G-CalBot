export interface DiscordUser {
  id?: string;
  userId?: string;
  username: string;
  global_name?: string;
  avatar?: string;
  avatarUrl?: string;
  discriminator?: string;
}

export interface CalendarFeed {
  id: string;
  name: string;
  url: string;
  addedAt?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  isAllDay: boolean;
  calendarName?: string;
}

export interface UserCalendarData {
  linked: boolean;
  reminderMinutes: number;
  enabled: boolean;
  userId: string;
  timezone: string;
  dailyDigestEnabled: boolean;
  dailyDigestTime: string;
  calendars: CalendarFeed[];
  events: CalendarEvent[];
}

export type ToastType = 'success' | 'error' | 'info';

export interface ToastInfo {
  message: string;
  type: ToastType;
}

export type TabId = 'schedule' | 'calendars' | 'settings';

export interface AuthResponse {
  user?: DiscordUser;
  sessionToken?: string;
  access_token?: string;
}

export interface SessionResponse {
  authenticated?: boolean;
  user?: DiscordUser;
}

export interface HealthResponse {
  storage?: string;
  time?: string;
}

export interface SettingsPayload {
  reminderMinutes: number;
  timezone: string;
  dailyDigestEnabled: boolean;
  dailyDigestTime: string;
}

export interface AddCalendarPayload {
  icalUrl: string;
  name?: string;
  reminderMinutes: number;
}

export interface AddCalendarResponse {
  calendar?: { name?: string };
  eventCount?: number;
}

export interface CalendarTheme {
  border: string;
  bg: string;
  text: string;
  badgeBg: string;
  dot: string;
}
