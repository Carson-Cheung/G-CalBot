export const DEMO_USER_ID = 'demo-user';
export const SESSION_STORAGE_KEY = 'gcalbot_session';

export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'America/Toronto', label: 'America/Toronto (Eastern UTC-4/5)' },
  { value: 'America/New_York', label: 'America/New_York (Eastern UTC-4/5)' },
  { value: 'America/Chicago', label: 'America/Chicago (Central UTC-5/6)' },
  { value: 'America/Denver', label: 'America/Denver (Mountain UTC-6/7)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (Pacific UTC-7/8)' },
  { value: 'America/Vancouver', label: 'America/Vancouver (Pacific UTC-7/8)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET/CEST)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST +4)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST +5:30)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT +8)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST +9)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST +10/11)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
];

export const LEAD_TIME_OPTIONS = [
  { value: 0, label: 'At Start', sub: '0 minutes prior' },
  { value: 5, label: '5 Minutes', sub: 'Prior to start' },
  { value: 10, label: '10 Minutes', sub: 'Standard default' },
  { value: 15, label: '15 Minutes', sub: 'Prior to start' },
  { value: 30, label: '30 Minutes', sub: 'Prior to start' },
  { value: 60, label: '1 Hour', sub: '60 minutes prior' },
];

export const DAY_MS = 24 * 60 * 60 * 1000;
