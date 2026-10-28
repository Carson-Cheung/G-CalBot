import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const DEFAULT_PUBLIC_URL = 'https://g-calbot.onrender.com';
export const MAX_CALENDARS_PER_USER = 10;

const SNOWFLAKE_PATTERN = /^\d{17,20}$/;

function env(name: string): string {
  return (process.env[name] || '').trim();
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = env(name);
  return raw ? Number(raw) : fallback;
}

export const config = {
  discordToken: env('DISCORD_TOKEN'),
  clientId: env('DISCORD_CLIENT_ID'),
  clientSecret: env('DISCORD_CLIENT_SECRET'),
  sessionSecret: env('SESSION_SECRET'),
  publicUrl: env('RENDER_EXTERNAL_URL') || env('PUBLIC_URL') || DEFAULT_PUBLIC_URL,
  port: parseIntEnv('PORT', 3000),
  syncIntervalMinutes: parseIntEnv('SYNC_INTERVAL_MINUTES', 5),
  // Number of reverse-proxy hops in front of the app; req.ip is only trustworthy when this matches.
  trustProxyHops: parseIntEnv('TRUST_PROXY_HOPS', 1),
  storagePath: env('STORAGE_PATH') || path.resolve(process.cwd(), 'data', 'database.json'),
  databaseUrl: env('DATABASE_URL'),
  ownerUserId: env('OWNER_USER_ID'),
  isDev: process.env.NODE_ENV !== 'production',
};

export interface ConfigValidationResult {
  errors: string[];
  warnings: string[];
}

export function validateConfig(): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    errors.push('PORT must be an integer between 1 and 65535.');
  }
  if (!Number.isInteger(config.syncIntervalMinutes) || config.syncIntervalMinutes < 1) {
    errors.push('SYNC_INTERVAL_MINUTES must be a positive integer.');
  }
  if (!Number.isInteger(config.trustProxyHops) || config.trustProxyHops < 0) {
    errors.push('TRUST_PROXY_HOPS must be a non-negative integer.');
  }
  try {
    const { protocol } = new URL(config.publicUrl);
    if (protocol !== 'https:' && protocol !== 'http:') throw new Error();
  } catch {
    errors.push('PUBLIC_URL / RENDER_EXTERNAL_URL must be an absolute http(s) URL.');
  }
  if (config.ownerUserId && !SNOWFLAKE_PATTERN.test(config.ownerUserId)) {
    errors.push('OWNER_USER_ID must be a Discord user ID.');
  }
  if (config.sessionSecret && config.sessionSecret.length < 32) {
    errors.push('SESSION_SECRET must be at least 32 characters.');
  }

  const hasSessionSecret = Boolean(
    config.sessionSecret || config.clientSecret || config.discordToken
  );
  if (!hasSessionSecret) {
    // Ephemeral keys break every session on restart and across instances, so refuse that in production.
    const message =
      'No SESSION_SECRET, DISCORD_CLIENT_SECRET or DISCORD_TOKEN set; session tokens cannot be signed persistently.';
    if (config.isDev) warnings.push(message);
    else errors.push(message);
  }
  if (!config.clientId || !config.clientSecret) {
    warnings.push(
      'DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET is missing; Discord Activity sign-in is disabled.'
    );
  }

  return { errors, warnings };
}

export default config;
