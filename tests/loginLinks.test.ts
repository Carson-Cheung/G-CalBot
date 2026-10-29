import { describe, it, expect } from 'vitest';
import { createLoginCode, redeemLoginCode, LOGIN_LINK_TTL_MS } from '../src/utils/loginLinks';

const user = { userId: '1', username: 'crow' };

describe('one-time login codes', () => {
  it('works once and then is consumed', () => {
    const code = createLoginCode(user);
    expect(redeemLoginCode(code)).toEqual(user);
    expect(redeemLoginCode(code)).toBeNull();
  });

  it('expires after the TTL and is consumed even when expired', () => {
    const t0 = 1_000_000;
    const code = createLoginCode(user, t0);
    expect(redeemLoginCode(code, t0 + LOGIN_LINK_TTL_MS)).toBeNull();
    expect(redeemLoginCode(code, t0)).toBeNull();
  });

  it('rejects unknown, non-string and oversized codes', () => {
    expect(redeemLoginCode('nope')).toBeNull();
    expect(redeemLoginCode(123)).toBeNull();
    expect(redeemLoginCode('x'.repeat(200))).toBeNull();
  });
});
