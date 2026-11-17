import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../src/config', () => ({
  config: { sessionSecret: 'test-secret', clientSecret: '', discordToken: '' },
}));

import { createSessionToken } from '../src/utils/session';
import { authorizeUser, resolveAuthorizedUserId, DEMO_USER_ID } from '../src/server/requestAuth';

const OWN_ID = '100000000000000001';
const OTHER_ID = '100000000000000002';

function makeReq(userId: string, token?: string): Request {
  return {
    params: { userId },
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as unknown as Request;
}

function makeRes() {
  const res = {
    locals: {} as Record<string, unknown>,
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

describe('resolveAuthorizedUserId', () => {
  let token: string;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    token = createSessionToken({ userId: OWN_ID, username: 'crow' });
  });
  afterEach(() => vi.useRealTimers());

  it('rejects an ID that differs from the session user', () => {
    expect(resolveAuthorizedUserId(makeReq(OTHER_ID, token)).unauthorized).toBe(true);
  });

  it('rejects a real-looking ID when there is no token', () => {
    expect(resolveAuthorizedUserId(makeReq(OWN_ID)).unauthorized).toBe(true);
  });

  it('treats "me" without a token as the demo user', () => {
    const result = resolveAuthorizedUserId(makeReq('me'));
    expect(result).toMatchObject({ userId: DEMO_USER_ID, unauthorized: false });
  });

  it('resolves "me" to the session user when signed in', () => {
    const result = resolveAuthorizedUserId(makeReq('me', token));
    expect(result).toMatchObject({ userId: OWN_ID, unauthorized: false });
  });

  it('accepts the caller\'s own ID with a valid token', () => {
    const result = resolveAuthorizedUserId(makeReq(OWN_ID, token));
    expect(result).toMatchObject({ userId: OWN_ID, unauthorized: false });
  });

  it('keeps the demo user even when signed in', () => {
    const result = resolveAuthorizedUserId(makeReq(DEMO_USER_ID, token));
    expect(result).toMatchObject({ userId: DEMO_USER_ID, unauthorized: false });
  });

  it('treats a tampered token as no session', () => {
    const [payload, sig] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ userId: OTHER_ID, username: 'evil', exp: Date.now() + 1e9 })
    ).toString('base64url');
    expect(payload).not.toBe(forged);
    const tampered = `${forged}.${sig}`;

    expect(resolveAuthorizedUserId(makeReq(OTHER_ID, tampered)).unauthorized).toBe(true);
    expect(resolveAuthorizedUserId(makeReq('me', tampered))).toMatchObject({
      userId: DEMO_USER_ID,
      session: null,
    });
  });
});

describe('authorizeUser', () => {
  let token: string;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    token = createSessionToken({ userId: OWN_ID, username: 'crow' });
  });
  afterEach(() => vi.useRealTimers());

  it('refuses the demo user with 403 when demo is not allowed', () => {
    const res = makeRes();
    const next = vi.fn();
    authorizeUser({ allowDemo: false })(makeReq(DEMO_USER_ID), res as unknown as Response, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('refuses another user\'s ID with 401', () => {
    const res = makeRes();
    const next = vi.fn();
    authorizeUser({ allowDemo: false })(makeReq(OTHER_ID, token), res as unknown as Response, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes the caller through and records who they are', () => {
    const res = makeRes();
    const next = vi.fn();
    authorizeUser({ allowDemo: false })(makeReq(OWN_ID, token), res as unknown as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.locals.auth).toEqual({
      userId: OWN_ID,
      session: expect.objectContaining({ userId: OWN_ID }),
      isDemo: false,
    });
  });

  it('lets the demo user through when demo is allowed', () => {
    const res = makeRes();
    const next = vi.fn();
    authorizeUser({ allowDemo: true })(makeReq(DEMO_USER_ID), res as unknown as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.locals.auth).toMatchObject({ userId: DEMO_USER_ID, isDemo: true });
  });
});
