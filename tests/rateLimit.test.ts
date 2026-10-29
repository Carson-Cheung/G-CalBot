import { describe, it, expect, afterEach } from 'vitest';
import { FixedWindowLimiter } from '../src/server/rateLimit';

describe('FixedWindowLimiter', () => {
  let limiter: FixedWindowLimiter;
  afterEach(() => limiter.stop());

  it('blocks over the limit with a retry delay, then resets after the window', () => {
    limiter = new FixedWindowLimiter({ windowMs: 1000, max: 2 });
    expect(limiter.hit('ip', 0)).toBe(0);
    expect(limiter.hit('ip', 100)).toBe(0);
    expect(limiter.hit('ip', 200)).toBe(800);
    expect(limiter.hit('ip', 1000)).toBe(0);
  });

  it('tracks keys independently', () => {
    limiter = new FixedWindowLimiter({ windowMs: 1000, max: 1 });
    limiter.hit('a', 0);
    expect(limiter.hit('a', 1)).toBeGreaterThan(0);
    expect(limiter.hit('b', 1)).toBe(0);
  });

  it('evicts the oldest key at capacity so memory stays bounded', () => {
    limiter = new FixedWindowLimiter({ windowMs: 1000, max: 1, maxKeys: 2 });
    limiter.hit('a', 0);
    limiter.hit('b', 0);
    limiter.hit('c', 0);
    // 'a' was evicted, so its count starts fresh instead of being limited.
    expect(limiter.hit('a', 1)).toBe(0);
  });
});
