import { Request, Response, NextFunction } from 'express';

const DEFAULT_MAX_KEYS = 10_000;

interface WindowRecord {
  count: number;
  resetAt: number;
}

export interface FixedWindowLimiterOptions {
  windowMs: number;
  max: number;
  // Hard ceiling on tracked keys so a flood of distinct IPs cannot grow memory without bound.
  maxKeys?: number;
}

/**
 * Fixed-window counter keyed by an arbitrary string. Expired windows are swept on a
 * timer so idle keys do not accumulate.
 */
export class FixedWindowLimiter {
  private readonly records = new Map<string, WindowRecord>();
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(private readonly options: FixedWindowLimiterOptions) {
    this.sweepTimer = setInterval(() => this.sweep(), options.windowMs);
    this.sweepTimer.unref();
  }

  /** Records a hit and returns ms until the window resets when over the limit, else 0. */
  hit(key: string, now = Date.now()): number {
    const record = this.records.get(key);
    if (!record || now >= record.resetAt) {
      if (!record) this.makeRoom(now);
      this.records.set(key, { count: 1, resetAt: now + this.options.windowMs });
      return 0;
    }
    record.count++;
    return record.count > this.options.max ? record.resetAt - now : 0;
  }

  private makeRoom(now: number): void {
    const maxKeys = this.options.maxKeys ?? DEFAULT_MAX_KEYS;
    if (this.records.size < maxKeys) return;
    this.sweep(now);
    if (this.records.size >= maxKeys) {
      // Map iteration follows insertion order, so this evicts the oldest window.
      const oldest = this.records.keys().next().value;
      if (oldest !== undefined) this.records.delete(oldest);
    }
  }

  sweep(now = Date.now()): void {
    for (const [key, record] of this.records) {
      if (now >= record.resetAt) this.records.delete(key);
    }
  }

  stop(): void {
    clearInterval(this.sweepTimer);
  }
}

export function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function rateLimitMiddleware(
  limiter: FixedWindowLimiter,
  { skip }: { skip?: (req: Request) => boolean } = {}
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (skip?.(req)) return next();
    const retryAfterMs = limiter.hit(clientIp(req));
    if (retryAfterMs > 0) {
      res.setHeader('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
      return res.status(429).json({
        error: 'Too many requests. Please slow down and try again shortly.',
      });
    }
    next();
  };
}
