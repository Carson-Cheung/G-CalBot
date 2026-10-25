import { Router, Request, Response } from "express";
import { config } from "../../config";
import {
  createSessionToken,
  verifySessionToken,
  getRecentActivityLaunch,
} from "../../utils/session";
import { activityLogger } from "../../utils/activityLogger";

export const authRouter = Router();

// App public config
authRouter.get(["/config", "/auth/config"], (_req: Request, res: Response) => {
  res.json({ clientId: config.clientId });
});

// Discord Activity OAuth2 token exchange
authRouter.post("/token", async (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: "Missing code parameter" });
  }

  try {
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "authorization_code",
        code: code,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Fetch user profile from Discord using the new access_token
    let user: any = null;
    let sessionToken: string | null = null;
    try {
      const userRes = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      if (userRes.ok) {
        user = await userRes.json();
      }
    } catch (uErr) {
      console.error("Failed to fetch user with access_token:", uErr);
    }

    if (user && user.id) {
      let avatarUrl: string | undefined = undefined;
      if (user.avatar) {
        avatarUrl = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
      } else {
        try {
          const defaultIndex = (BigInt(user.id) >> 22n) % 6n;
          avatarUrl = `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
        } catch {
          avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
        }
      }

      sessionToken = createSessionToken({
        userId: user.id,
        username: user.global_name || user.username,
        avatarUrl,
      });
    }

    res.json({ ...data, user, sessionToken });
  } catch (err: any) {
    console.error("OAuth token exchange error:", err);
    res.status(500).json({ error: "Token exchange failed" });
  }
});

// Verify current session token
authRouter.get(["/auth/session", "/session"], (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  let token: string | null = null;
  if (typeof authHeader === "string" && authHeader.trim()) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    token = match ? match[1].trim() : authHeader.trim();
  } else if (
    typeof req.query.session === "string" &&
    req.query.session.trim()
  ) {
    token = req.query.session.trim();
  }

  const payload = verifySessionToken(token);
  if (payload) {
    if (req.query.initial === "true") {
      activityLogger.log(
        "system",
        "🌐",
        `Discord Activity web dashboard connected for the user @${payload.username}`,
      );
    }
    return res.json({ authenticated: true, user: payload });
  }

  return res.json({
    authenticated: false,
    user: { userId: "demo-user", username: "Demo Showcase" },
  });
});

// Discord Activity iframe launch handoff
authRouter.post(
  ["/auth/activity-handoff", "/activity-handoff"],
  (req: Request, res: Response) => {
    const { frameId, isInsideDiscord, isDemoLaunch } = req.body || {};
    if (isDemoLaunch) {
      activityLogger.log(
        "system",
        "📱",
        "Discord Activity launched demo/guest session.             Was that you? ;)",
      );
      return res.json({ authenticated: false });
    }

    if (!frameId && !isInsideDiscord) {
      return res.status(400).json({
        authenticated: false,
        error:
          "Activity handoff is only permitted from Discord Activity context",
      });
    }

    const recentUser = getRecentActivityLaunch();
    if (recentUser) {
      activityLogger.log(
        "system",
        "📱",
        `Discord Activity connected for the user @${recentUser.username}`,
      );
      const sessionToken = createSessionToken(recentUser);
      return res.json({ authenticated: true, sessionToken, user: recentUser });
    }

    activityLogger.log(
      "system",
      "📱",
      "Discord Activity launched demo/guest session.                 Was that you? ;)",
    );
    return res.json({ authenticated: false });
  },
);

export default authRouter;
