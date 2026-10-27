import crypto from 'crypto';
import { config } from '../config';

export interface SessionPayload {
  userId: string;
  username: string;
  avatarUrl?: string;
  exp: number;
}

let ephemeralSecret: string | null = null;

function getSecret(): string {
  const secret = (config.clientSecret || config.discordToken || '').trim();
  if (secret) {
    return secret;
  }
  if (!ephemeralSecret) {
    ephemeralSecret = crypto.randomBytes(32).toString('hex');
    console.warn(
      '⚠️ No DISCORD_CLIENT_SECRET or DISCORD_TOKEN configured. Using cryptographically secure in-memory ephemeral secret for session tokens.'
    );
  }
  return ephemeralSecret;
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
