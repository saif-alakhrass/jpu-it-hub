import { describe, expect, it } from 'vitest';
import { deriveBatchStatus } from './batchStatus';

describe('batch status derivation', () => {
  it('approves a batch only when every file is approved', () => {
    expect(deriveBatchStatus(['approved', 'approved'])).toBe('approved');
    expect(deriveBatchStatus(['approved', 'pending'])).toBe('pending');
  });

  it('rejects a batch only when every file is rejected', () => {
    expect(deriveBatchStatus(['rejected', 'rejected'])).toBe('rejected');
    expect(deriveBatchStatus(['rejected', 'approved'])).toBe('pending');
  });

  it('keeps empty and mixed batches pending', () => {
    expect(deriveBatchStatus([])).toBe('pending');
    expect(deriveBatchStatus(['pending', 'rejected'])).toBe('pending');
  });
});
