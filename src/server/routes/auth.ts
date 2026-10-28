import { Router, Request, Response } from 'express';
import { config } from '../../config';
import { createSessionToken } from '../../utils/session';
import { activityLogger, censorUsername } from '../../utils/activityLogger';
import { DEMO_USER_ID, getRequestSession } from '../requestAuth';

const DISCORD_API = 'https://discord.com/api';
const DISCORD_TIMEOUT_MS = 10_000;
const MAX_OAUTH_CODE_LENGTH = 512;

interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

function discordAvatarUrl(user: DiscordUser): string {
  if (user.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
  }
  try {
    const defaultIndex = (BigInt(user.id) >> 22n) % 6n;
    return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
  } catch {
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
  }
}

async function exchangeCodeForAccessToken(code: string): Promise<string | null> {
  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      code,
    }),
    signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
  });
  if (!response.ok) {
    console.warn(`Discord OAuth code exchange rejected (HTTP ${response.status})`);
    return null;
  }
  const data = (await response.json()) as { access_token?: unknown };
  return typeof data.access_token === 'string' ? data.access_token : null;
}

async function fetchDiscordUser(accessToken: string): Promise<DiscordUser | null> {
  const response = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const user = (await response.json()) as Partial<DiscordUser>;
  if (typeof user.id !== 'string' || typeof user.username !== 'string') return null;
  return user as DiscordUser;
}

export const authRouter = Router();

authRouter.get(['/config', '/auth/config'], (_req: Request, res: Response) => {
  res.json({ clientId: config.clientId });
});

// Exchanges a Discord Activity OAuth2 code for our own signed session. The Discord
// access token stays server-side because the client only needs the session token.
authRouter.post('/token', async (req: Request, res: Response) => {
  const code = req.body?.code;
  if (typeof code !== 'string' || !code || code.length > MAX_OAUTH_CODE_LENGTH) {
    return res.status(400).json({ error: 'Missing code parameter' });
  }
  if (!config.clientId || !config.clientSecret) {
    return res.status(503).json({ error: 'Discord sign-in is not configured on this server' });
  }

  try {
    const accessToken = await exchangeCodeForAccessToken(code);
    if (!accessToken) {
      return res.status(401).json({ error: 'Discord rejected the authorization code' });
    }
    const user = await fetchDiscordUser(accessToken);
    if (!user) {
      return res.status(502).json({ error: 'Could not load your Discord profile' });
    }

    const displayName = user.global_name || user.username;
    const avatarUrl = discordAvatarUrl(user);
    const sessionToken = createSessionToken({ userId: user.id, username: displayName, avatarUrl });

    activityLogger.log('system', '📱', `Discord Activity authenticated for ${censorUsername(displayName)}`);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        global_name: user.global_name ?? null,
        avatar: user.avatar ?? null,
        avatarUrl,
      },
      sessionToken,
    });
  } catch (err) {
    console.error('OAuth token exchange error:', err);
    res.status(502).json({ error: 'Token exchange failed' });
  }
});

authRouter.get(['/auth/session', '/session'], (req: Request, res: Response) => {
  const session = getRequestSession(req);
  if (session) {
    if (req.query.initial === 'true') {
      activityLogger.log(
        'system',
        '🌐',
        `Discord Activity web dashboard connected for ${censorUsername(session.username)}`
      );
    }
    return res.json({ authenticated: true, user: session });
  }

  return res.json({
    authenticated: false,
    user: { userId: DEMO_USER_ID, username: 'Demo Showcase' },
  });
});

authRouter.post(['/auth/activity-handoff', '/activity-handoff'], (_req: Request, res: Response) => {
  activityLogger.log(
    'system',
    '📱',
    'Discord Activity launched demo/guest session............. Was that you? ;)'
  );
  return res.json({ authenticated: false });
});

export default authRouter;
