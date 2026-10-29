import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/config', () => ({
  config: { sessionSecret: 'test-secret', clientSecret: '', discordToken: '' },
}));

import { createSessionToken, verifySessionToken, parseBearerToken } from '../src/utils/session';

const user = { userId: '123', username: 'crow' };

describe('session tokens', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('round-trips a valid token', () => {
    const payload = verifySessionToken(createSessionToken(user));
    expect(payload).toMatchObject({ userId: '123', username: 'crow' });
  });

  it('rejects an expired token', () => {
    const token = createSessionToken(user, 1000);
    vi.setSystemTime(new Date('2025-01-01T00:00:01Z'));
    expect(verifySessionToken(token)).toBeNull();
  });

  it('rejects a token whose payload was tampered with', () => {
    const [, sig] = createSessionToken(user).split('.');
    const forged = Buffer.from(
      JSON.stringify({ userId: '999', username: 'evil', exp: Date.now() + 1e9 })
    ).toString('base64url');
    expect(verifySessionToken(`${forged}.${sig}`)).toBeNull();
  });

  it('rejects malformed and oversized input', () => {
    expect(verifySessionToken('nodot')).toBeNull();
    expect(verifySessionToken('a.b.c')).toBeNull();
    expect(verifySessionToken('x'.repeat(3000))).toBeNull();
    expect(verifySessionToken(null)).toBeNull();
  });

  it('extracts bearer tokens only from well-formed headers', () => {
    expect(parseBearerToken('Bearer abc.def')).toBe('abc.def');
    expect(parseBearerToken('Basic abc')).toBeNull();
    expect(parseBearerToken(undefined)).toBeNull();
  });
});
