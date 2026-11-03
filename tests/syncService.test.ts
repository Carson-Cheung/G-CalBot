import { describe, it, expect } from 'vitest';
import { describeFetchError } from '../src/calendar/syncService';

function codedError(code: string, message: string): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code });
}

describe('describeFetchError', () => {
  it('collapses an AggregateError of connection attempts into one line', () => {
    const aggregate = Object.assign(new AggregateError([
      codedError('ETIMEDOUT', 'connect ETIMEDOUT 142.251.34.238:443'),
      codedError('ENETUNREACH', 'connect ENETUNREACH 2607:f8b0:4009:81f::200e:443'),
    ]), { code: 'ETIMEDOUT' });

    const text = describeFetchError(aggregate);
    expect(text).toContain('ETIMEDOUT');
    expect(text).toContain('ENETUNREACH');
    expect(text).not.toContain('\n');
  });

  it('falls back to the message when there is no error code', () => {
    expect(describeFetchError(new Error('Failed to download calendar (HTTP status 500)'))).toBe(
      'Failed to download calendar (HTTP status 500)',
    );
  });
});
