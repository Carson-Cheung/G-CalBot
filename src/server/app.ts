import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { ReminderEngine } from '../calendar/reminderEngine';
import { authRouter } from './routes/auth';
import { createCalendarRouter } from './routes/calendar';

export function createServer(reminderEngine?: ReminderEngine): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Mount modular API routers
  app.use('/api', authRouter);
  app.use('/api', createCalendarRouter(reminderEngine));

  // Direct alias for convenience
  app.get('/logs', (_req: Request, res: Response) => {
    res.redirect('/api/logs');
  });

  // Serve static files from public directory with no-store cache headers
  // so Discord's Activity proxy (discordsays.com) never caches stale JS/CSS bundles
  const publicDir = path.resolve(process.cwd(), 'public');
  if (fs.existsSync(publicDir)) {
    app.use(
      express.static(publicDir, {
        etag: false,
        lastModified: false,
        setHeaders: (res) => {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        },
      })
    );
  }

  // Fallback to index.html for single-page app (Express 5 wildcard syntax)
  const sendSpaIndex = (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const indexPath = path.resolve(publicDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.send('<h1>Google Calendar Discord Bot & Activity</h1><p>Server is running!</p>');
    }
  };

  app.get('/{*splat}', sendSpaIndex);
  app.use(sendSpaIndex);

  return app;
}

export default createServer;
