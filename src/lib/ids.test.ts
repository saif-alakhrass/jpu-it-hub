import { describe, expect, it } from 'vitest';
import { isUuid } from './ids';

describe('UUID validation', () => {
  it('accepts valid application IDs', () => {
    expect(isUuid('a1b2c3d4-e5f6-4890-abcd-ef1234567890')).toBe(true);
  });

  it('rejects malformed route values before database queries', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('../../../etc/passwd')).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});
