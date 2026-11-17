import { describe, it, expect } from 'vitest';
import { withVerifiedSsl } from '../src/db/postgres';

const BASE = 'postgresql://user:p%40ss%2Fw0rd@host.example/db';

describe('withVerifiedSsl', () => {
  it.each(['require', 'prefer', 'verify-ca'])('upgrades sslmode=%s to verify-full', (mode) => {
    expect(withVerifiedSsl(`${BASE}?sslmode=${mode}`)).toBe(`${BASE}?sslmode=verify-full`);
  });

  it('leaves every other part of the URL untouched', () => {
    expect(withVerifiedSsl(`${BASE}?channel_binding=require&sslmode=require&application_name=a%20b`)).toBe(
      `${BASE}?channel_binding=require&sslmode=verify-full&application_name=a%20b`,
    );
  });

  it('adds sslmode=verify-full when none is given', () => {
    expect(withVerifiedSsl(BASE)).toBe(`${BASE}?sslmode=verify-full`);
    expect(withVerifiedSsl(`${BASE}?connect_timeout=5`)).toBe(`${BASE}?connect_timeout=5&sslmode=verify-full`);
  });

  it.each(['disable', 'no-verify', 'verify-full'])('keeps sslmode=%s as written', (mode) => {
    const url = `${BASE}?sslmode=${mode}&application_name=bot`;
    expect(withVerifiedSsl(url)).toBe(url);
  });

  it('trims surrounding whitespace', () => {
    expect(withVerifiedSsl(`  ${BASE}?sslmode=require \n`)).toBe(`${BASE}?sslmode=verify-full`);
  });
});
