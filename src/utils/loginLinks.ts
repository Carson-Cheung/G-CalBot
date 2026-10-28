import crypto from 'crypto';

export const LOGIN_LINK_TTL_MS = 10 * 60 * 1000;

// Codes are 256-bit random, so guessing is not a concern; this only bounds memory.
const MAX_PENDING_CODES = 5_000;
const MAX_CODE_LENGTH = 128;

export interface LoginLinkUser {
  userId: string;
  username: string;
  avatarUrl?: string;
}

interface PendingLogin {
  user: LoginLinkUser;
  expiresAt: number;
}

const pending = new Map<string, PendingLogin>();

function sweep(now: number): void {
  for (const [code, entry] of pending) {
    if (entry.expiresAt <= now) pending.delete(code);
  }
}

/**
 * Issues a short-lived, single-use code for the /dash web link. The URL then
 * never carries a reusable session token, and a leaked or forwarded link stops
 * working once it is used or expires.
 */
export function createLoginCode(user: LoginLinkUser, now = Date.now()): string {
  if (pending.size >= MAX_PENDING_CODES) {
    sweep(now);
    if (pending.size >= MAX_PENDING_CODES) {
      // Map iteration follows insertion order, so this drops the oldest code.
      const oldest = pending.keys().next().value;
      if (oldest !== undefined) pending.delete(oldest);
    }
  }
  const code = crypto.randomBytes(32).toString('base64url');
  pending.set(code, { user, expiresAt: now + LOGIN_LINK_TTL_MS });
  return code;
}

/** Returns the user for a valid code and deletes it, so each code works once. */
export function redeemLoginCode(code: unknown, now = Date.now()): LoginLinkUser | null {
  if (typeof code !== 'string' || !code || code.length > MAX_CODE_LENGTH) return null;
  const entry = pending.get(code);
  if (!entry) return null;
  pending.delete(code);
  return entry.expiresAt > now ? entry.user : null;
}
