import { describe, it, expect, afterEach } from 'vitest';
import { FixedWindowLimiter, rateLimitKey } from '../src/server/rateLimit';

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

describe('rateLimitKey', () => {
  it('returns IPv4 addresses unchanged', () => {
    expect(rateLimitKey('203.0.113.7')).toBe('203.0.113.7');
  });

  it('unwraps IPv4-mapped IPv6 addresses', () => {
    expect(rateLimitKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('groups IPv6 addresses by /64', () => {
    const a = rateLimitKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
    expect(rateLimitKey('2001:db8:1:2::1')).toBe(a);
    expect(rateLimitKey('2001:db8:1:3::1')).not.toBe(a);
  });

  it('gives compressed and expanded spellings the same key', () => {
    expect(rateLimitKey('2001:db8::1')).toBe(rateLimitKey('2001:db8:0:0:ffff::2'));
  });

  it('returns a non-IP string unchanged', () => {
    expect(rateLimitKey('unknown')).toBe('unknown');
  });
});
