import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { ReminderEngine } from '../calendar/reminderEngine';
import { authRouter } from './routes/auth';
import { createCalendarRouter } from './routes/calendar';
import { createSystemRouter } from './routes/system';
import { FixedWindowLimiter, rateLimitMiddleware } from './rateLimit';

const NO_STORE = 'no-store, no-cache, must-revalidate, proxy-revalidate';

const DISCORD_ORIGINS = new Set([
  'https://discord.com',
  'https://ptb.discord.com',
  'https://canary.discord.com',
]);

function publicOrigin(): string | null {
  try {
    return new URL(config.publicUrl).origin;
  } catch {
    return null;
  }
}

function isAllowedOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const host = url.hostname;
  const isHttps = url.protocol === 'https:';

  if (isHttps && (DISCORD_ORIGINS.has(origin) || host.endsWith('.discordsays.com'))) return true;
  if (isHttps && (host === 'carsoncheung.work' || host.endsWith('.carsoncheung.work'))) return true;
  if (origin === publicOrigin()) return true;
  if (origin === `http://localhost:${config.port}` || origin === `http://127.0.0.1:${config.port}`) {
    return true;
  }
  return config.isDev && (host === 'localhost' || host === '127.0.0.1');
}

const corsOptions: cors.CorsOptions = {
  // Requests without an Origin header are same-origin or non-browser clients, which CORS does not govern.
  origin: (origin, callback) => callback(null, !origin || isAllowedOrigin(origin)),
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 600,
};

function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (!config.isDev) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}

function apiNotFound(_req: Request, res: Response) {
  res.status(404).json({ error: 'Not found' });
}

function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);
  const status =
    typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number'
      ? err.status
      : 500;
  if (status >= 500) {
    console.error('Unhandled request error:', err);
  }
  // Body-parser failures carry a 4xx status; their messages and stacks are never echoed back.
  res.status(status).json({ error: status < 500 ? 'Invalid request' : 'Internal server error' });
}

export function createServer(reminderEngine?: ReminderEngine): Express {
  const app = express();

  app.set('trust proxy', config.trustProxyHops);
  app.disable('x-powered-by');

  app.use(securityHeaders);
  app.use(cors(corsOptions));

  const api = express.Router();
  const apiRateLimiter = new FixedWindowLimiter({ windowMs: 60 * 1000, max: 120 });
  api.use(rateLimitMiddleware(apiRateLimiter, { skip: (req) => req.path === '/health' }));
  api.use(express.json({ limit: '16kb' }));
  api.use(authRouter);
  api.use(createSystemRouter(reminderEngine));
  api.use(createCalendarRouter(reminderEngine));
  api.use(apiNotFound);
  app.use('/api', api);

  app.get('/logs', (_req: Request, res: Response) => {
    res.redirect('/api/logs');
  });

  // no-store keeps Discord's Activity proxy (discordsays.com) from serving stale JS/CSS bundles.
  const publicDir = path.resolve(process.cwd(), 'public');
  const indexPath = path.resolve(publicDir, 'index.html');
  if (fs.existsSync(publicDir)) {
    app.use(
      express.static(publicDir, {
        // Lets /privacy and /terms resolve to their .html files.
        extensions: ['html'],
        etag: false,
        lastModified: false,
        setHeaders: (res) => {
          res.setHeader('Cache-Control', NO_STORE);
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        },
      })
    );
  }

  app.use((_req: Request, res: Response) => {
    res.setHeader('Cache-Control', NO_STORE);
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.send('<h1>Google Calendar Discord Bot & Activity</h1><p>Server is running!</p>');
    }
  });

  app.use(errorHandler);

  return app;
}

export default createServer;
