import { Router, Request, Response } from 'express';
import { config } from '../../config';
import { storage } from '../../db/storage';
import { ReminderEngine } from '../../calendar/reminderEngine';
import { activityLogger } from '../../utils/activityLogger';
import { getRequestSession } from '../requestAuth';

export function createSystemRouter(reminderEngine?: ReminderEngine): Router {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      storage: storage.isPostgresConnected() ? 'neon-postgresql' : 'local-json',
    });
  });

  // The backup contains every user's secret iCal URL, so only the bot owner may read it.
  router.get('/backup', async (req: Request, res: Response) => {
    const session = getRequestSession(req);
    // Check the session first so anonymous callers cannot trigger Discord API lookups.
    const ownerId = session
      ? (await reminderEngine?.getOwnerUserId()) || config.ownerUserId
      : null;
    if (!session || !ownerId || session.userId !== ownerId) {
      return res.status(401).json({
        error: 'Unauthorized: Database backup endpoint is restricted to the bot owner.',
      });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(storage.getBackup());
  });

  router.get('/logs', (req: Request, res: Response) => {
    const orderParam = typeof req.query.order === 'string' ? req.query.order.toLowerCase() : '';
    const order = orderParam === 'desc' || orderParam === 'newest' ? 'desc' : 'asc';
    const logs = activityLogger.getLogs(order);
    res.json({ status: 'ok', count: logs.length, logs });
  });

  return router;
}

export default createSystemRouter;
