import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/config', () => ({ config: { port: 3000 } }));

import { censorUsername } from '../src/utils/activityLogger';

describe('censorUsername', () => {
  it('keeps only the first character with a fixed-length mask', () => {
    expect(censorUsername('@Crow!')).toBe('@C*****');
    expect(censorUsername('Al')).toBe('@A*****');
    expect(censorUsername('averyveryverylongname')).toBe('@a*****');
  });

  it('does not split multi-code-unit characters', () => {
    expect(censorUsername('\u{1F600}bob')).toBe('@\u{1F600}*****');
  });

  it('falls back to a placeholder for empty input', () => {
    expect(censorUsername('')).toBe('@a*****');
    expect(censorUsername(null)).toBe('@a*****');
    expect(censorUsername('  @ ')).toBe('@a*****');
  });
});
