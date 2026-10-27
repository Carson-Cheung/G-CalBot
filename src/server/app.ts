import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { ReminderEngine } from '../calendar/reminderEngine';
import { authRouter } from './routes/auth';
import { createCalendarRouter } from './routes/calendar';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const ipRateLimits = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;

function apiRateLimiter(req: Request, res: Response, next: NextFunction) {
  // Allow health checks through without counting
  if (req.path === '/health') return next();

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const record = ipRateLimits.get(ip);

  if (!record || now > record.resetAt) {
    ipRateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  record.count++;
  if (record.count > RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Too many requests. Please slow down and try again shortly.',
    });
  }

  // Periodic cleanup if map grows
  if (ipRateLimits.size > 1000) {
    for (const [key, val] of ipRateLimits.entries()) {
      if (now > val.resetAt) ipRateLimits.delete(key);
    }
  }

  next();
}

export function createServer(reminderEngine?: ReminderEngine): Express {
  const app = express();

  // Trust first proxy hop (e.g. Render, Cloudflare, Fly, Vercel) for accurate client IP resolution
  app.set('trust proxy', 1);

  app.disable('x-powered-by');

  // Security headers middleware
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  const allowedOrigins = [
    config.publicUrl,
    `http://localhost:${config.port}`,
    `http://127.0.0.1:${config.port}`,
    'https://carsoncheung.work',
  ];

  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      // Allow non-browser requests (e.g. curl, Discord webhooks, server-to-server)
      if (!origin) return callback(null, true);

      // Discord Activity proxy and Discord domains
      if (
        origin.endsWith('.discordsays.com') ||
        origin === 'https://discord.com' ||
        origin === 'https://ptb.discord.com' ||
        origin === 'https://canary.discord.com'
      ) {
        return callback(null, true);
      }

      // User portfolio website and Vercel preview environments
      if (
        origin === 'https://carsoncheung.work' ||
        origin.endsWith('.carsoncheung.work') ||
        origin.endsWith('.vercel.app')
      ) {
        return callback(null, true);
      }

      // Explicitly allowed origins
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Local development
      if (config.isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      // Reject untrusted cross-origin requests gracefully
      callback(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  };

  app.use(cors(corsOptions));
  app.use(express.json({ limit: '1mb' }));

  // Mount modular API routers with rate limiting
  app.use('/api', apiRateLimiter, authRouter);
  app.use('/api', apiRateLimiter, createCalendarRouter(reminderEngine));

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
