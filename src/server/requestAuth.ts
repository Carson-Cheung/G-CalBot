import { Request, Response, NextFunction } from 'express';
import { parseBearerToken, verifySessionToken, SessionPayload } from '../utils/session';

export const DEMO_USER_ID = 'demo-user';

export function getRequestSession(req: Request): SessionPayload | null {
  return verifySessionToken(parseBearerToken(req.headers.authorization));
}

/**
 * Maps the `:userId` route param to the user the caller may act as. `me` and
 * `demo-user` never fail; any other ID must match the signed session exactly.
 */
export function resolveAuthorizedUserId(
  req: Request
): { userId: string; session: SessionPayload | null; unauthorized: boolean } {
  const session = getRequestSession(req);
  const rawParam = req.params.userId;
  const requestedId = String((Array.isArray(rawParam) ? rawParam[0] : rawParam) || '').trim();

  if (!requestedId || requestedId === 'undefined' || requestedId === 'null' || requestedId === DEMO_USER_ID) {
    return { userId: DEMO_USER_ID, session, unauthorized: false };
  }
  if (requestedId === 'me') {
    return { userId: session ? session.userId : DEMO_USER_ID, session, unauthorized: false };
  }
  if (!session || session.userId !== requestedId) {
    return { userId: DEMO_USER_ID, session, unauthorized: true };
  }
  return { userId: session.userId, session, unauthorized: false };
}

export interface AuthorizedLocals {
  userId: string;
  session: SessionPayload | null;
  isDemo: boolean;
}

export function getAuthorized(res: Response): AuthorizedLocals {
  return res.locals.auth as AuthorizedLocals;
}

/**
 * Rejects callers acting on another user's data and stores the resolved user on
 * `res.locals.auth`. With `allowDemo: false` the read-only demo user is refused too.
 */
export function authorizeUser({ allowDemo }: { allowDemo: boolean }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { userId, session, unauthorized } = resolveAuthorizedUserId(req);
    if (unauthorized) {
      return res.status(401).json({
        error: 'Unauthorized: Please sign in through Discord or run /dash in Discord to access your personal calendar.',
      });
    }
    const isDemo = userId === DEMO_USER_ID;
    if (isDemo && !allowDemo) {
      return res.status(403).json({
        error: 'Demo mode is read-only. Run /dash in Discord or launch the Activity to manage your own calendar!',
      });
    }
    const auth: AuthorizedLocals = { userId, session, isDemo };
    res.locals.auth = auth;
    next();
  };
}
