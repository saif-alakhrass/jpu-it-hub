import { describe, expect, it } from 'vitest';
import { shouldUseMobileReader } from './filePreview';

describe('Office file preview', () => {
  it('uses the full-page viewer on phones and touch-first tablets', () => {
    expect(shouldUseMobileReader(390, 5)).toBe(true);
    expect(shouldUseMobileReader(1024, 5)).toBe(true);
    expect(shouldUseMobileReader(1440, 0)).toBe(false);
  });
});
