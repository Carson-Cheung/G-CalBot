import { Router, Request, Response } from 'express';
import { config } from '../../config';

export const authRouter = Router();

// App public config
authRouter.get('/config', (_req: Request, res: Response) => {
  res.json({ clientId: config.clientId });
});

// Discord Activity OAuth2 token exchange
authRouter.post('/token', async (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Missing code parameter' });
  }

  try {
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'authorization_code',
        code: code,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Fetch user profile from Discord using the new access_token
    let user = null;
    try {
      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      if (userRes.ok) {
        user = await userRes.json();
      }
    } catch (uErr) {
      console.error('Failed to fetch user with access_token:', uErr);
    }

    res.json({ ...data, user });
  } catch (err: any) {
    console.error('OAuth token exchange error:', err);
    res.status(500).json({ error: 'Token exchange failed' });
  }
});

export default authRouter;
