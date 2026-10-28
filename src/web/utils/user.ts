import type { DiscordUser } from '../types';
import { DEMO_USER_ID } from '../constants';

export function getUserId(user: DiscordUser): string {
  return user.id || user.userId || DEMO_USER_ID;
}

export function getUserAvatarUrl(user: DiscordUser): string {
  if (user.avatarUrl) return user.avatarUrl;
  const uid = user.id || user.userId || '';
  if (user.avatar && uid) {
    return `https://cdn.discordapp.com/avatars/${uid}/${user.avatar}.png?size=64`;
  }
  try {
    const defaultIndex = (BigInt(uid) >> 22n) % 6n;
    return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
  } catch {
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
  }
}

export function maskFeedUrl(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/private-[a-zA-Z0-9]+/g, 'private-••••••••')
    .replace(/token=[a-zA-Z0-9]+/g, 'token=••••••••')
    .slice(0, 56);
}

export function countEventsFor(events: { calendarName?: string }[], calendarName: string): number {
  const target = calendarName.toLowerCase();
  return events.filter(e => (e.calendarName || '').toLowerCase() === target).length;
}
