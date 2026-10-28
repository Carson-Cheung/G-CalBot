import crypto from 'crypto';
import { config } from '../config';

export interface SessionPayload {
  userId: string;
  username: string;
  avatarUrl?: string;
  exp: number;
}

export const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Issued tokens are a few hundred bytes; oversized input is rejected before hashing.
const MAX_TOKEN_LENGTH = 2048;

let cachedSecret: string | null = null;

function getSecret(): string {
  if (cachedSecret) return cachedSecret;

  const configured = config.sessionSecret || config.clientSecret || config.discordToken;
  if (configured) {
    cachedSecret = configured;
  } else {
    cachedSecret = crypto.randomBytes(32).toString('hex');
    console.warn(
      '⚠️ No SESSION_SECRET, DISCORD_CLIENT_SECRET or DISCORD_TOKEN configured. Session tokens use an in-memory key and will not survive a restart.'
    );
  }
  return cachedSecret;
}

function sign(payloadEncoded: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payloadEncoded).digest('base64url');
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.userId === 'string' &&
    p.userId.length > 0 &&
    typeof p.username === 'string' &&
    typeof p.exp === 'number' &&
    Number.isFinite(p.exp) &&
    (p.avatarUrl === undefined || typeof p.avatarUrl === 'string')
  );
}

/**
 * Creates an HMAC-SHA256 signed session token for a Discord user.
 * Format: `${base64urlPayload}.${base64urlSignature}`
 */
export function createSessionToken(
  user: { userId: string; username: string; avatarUrl?: string },
  ttlMs = DEFAULT_SESSION_TTL_MS
): string {
  const payload: SessionPayload = {
    userId: String(user.userId),
    username: String(user.username || 'Discord User'),
    avatarUrl: user.avatarUrl,
    exp: Date.now() + ttlMs,
  };

  const payloadEncoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${payloadEncoded}.${sign(payloadEncoded)}`;
}

/**
 * Verifies an HMAC-SHA256 signed session token, returning its payload when the
 * signature matches and the token has not expired.
 */
export function verifySessionToken(token?: string | null): SessionPayload | null {
  if (!token || typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) {
    return null;
  }

  const parts = token.trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  const [payloadEncoded, signature] = parts;

  const expected = Buffer.from(sign(payloadEncoded), 'utf8');
  const provided = Buffer.from(signature, 'utf8');
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8'));
    if (!isSessionPayload(payload) || payload.exp <= Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Extracts the token from an `Authorization: Bearer <token>` header value.
 */
export function parseBearerToken(header: string | undefined): string | null {
  if (typeof header !== 'string') return null;
  const match = header.match(/^\s*Bearer\s+(\S+)\s*$/i);
  return match ? match[1] : null;
}
