import crypto from 'crypto';
import { config } from '../config';

export interface SessionPayload {
  userId: string;
  username: string;
  avatarUrl?: string;
  exp: number;
}

function getSecret(): string {
  return config.clientSecret || config.discordToken || 'gcalbot-fallback-secret';
}

/**
 * Creates an HMAC-SHA256 signed session token for a Discord user.
 * Format: `${base64urlPayload}.${base64urlSignature}`
 */
export function createSessionToken(
  user: { userId: string; username: string; avatarUrl?: string },
  ttlMs = 7 * 24 * 60 * 60 * 1000
): string {
  const payload: SessionPayload = {
    userId: String(user.userId),
    username: String(user.username || 'Discord User'),
    avatarUrl: user.avatarUrl,
    exp: Date.now() + ttlMs,
  };

  const payloadEncoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSecret())
    .update(payloadEncoded)
    .digest('base64url');

  return `${payloadEncoded}.${signature}`;
}

/**
 * Verifies an HMAC-SHA256 signed session token.
 * Validates cryptographic timing-safe signature equality and expiration.
 */
export function verifySessionToken(token?: string | null): SessionPayload | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.trim().split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payloadEncoded, signature] = parts;
  if (!payloadEncoded || !signature) {
    return null;
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', getSecret())
      .update(payloadEncoded)
      .digest('base64url');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expectedSigBuf = Buffer.from(expectedSignature, 'utf8');

    if (sigBuf.length !== expectedSigBuf.length) {
      return null;
    }

    if (!crypto.timingSafeEqual(sigBuf, expectedSigBuf)) {
      return null;
    }

    const payloadJson = Buffer.from(payloadEncoded, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson) as SessionPayload;

    if (!payload || typeof payload !== 'object') {
      return null;
    }

    if (!payload.userId || typeof payload.exp !== 'number') {
      return null;
    }

    if (payload.exp <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// In-memory Activity Launch Handoff Store
interface RecentLaunch {
  user: { userId: string; username: string; avatarUrl?: string };
  timestamp: number;
}

let recentLaunch: RecentLaunch | null = null;
const HANDOFF_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Stores the most recent Discord user who interacted with the bot or invoked /act or /dash.
 */
export function recordActivityLaunch(user: { userId: string; username: string; avatarUrl?: string }): void {
  if (!user || !user.userId) return;
  recentLaunch = {
    user: {
      userId: String(user.userId),
      username: String(user.username || 'Discord User'),
      avatarUrl: user.avatarUrl,
    },
    timestamp: Date.now(),
  };
}

/**
 * Retrieves the most recent Discord user who interacted with the bot / launched the Activity
 * within the last 10 minutes. Returns null if expired or not found.
 */
export function getRecentActivityLaunch(): { userId: string; username: string; avatarUrl?: string } | null {
  if (!recentLaunch) return null;
  if (Date.now() - recentLaunch.timestamp > HANDOFF_TTL_MS) {
    recentLaunch = null;
    return null;
  }
  return recentLaunch.user;
}
