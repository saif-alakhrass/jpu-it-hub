import { describe, expect, it } from 'vitest';
import { isPublicQueryKey } from './queryClient';

describe('public query persistence boundary', () => {
  it('persists public subject lists and details', () => {
    expect(isPublicQueryKey(['subjects', 'paged', 0, '', 'علم الحاسوب'])).toBe(true);
    expect(isPublicQueryKey(['subjects', 'detail', 'subject-id'])).toBe(true);
  });

  it('never persists files, profiles, notifications, or admin data', () => {
    expect(isPublicQueryKey(['files', 'subject', 'subject-id', 'summaries'])).toBe(false);
    expect(isPublicQueryKey(['profile', 'user-id'])).toBe(false);
    expect(isPublicQueryKey(['notifications', 'user-id'])).toBe(false);
    expect(isPublicQueryKey(['admin', 'files'])).toBe(false);
  });
});
