import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAppQueryClient,
  enablePublicQueryPersistence,
  isPublicQueryKey,
  restorePublicQueryCache,
} from './queryClient';

const STORAGE_KEY = 'jpu-it-hub:public-query-cache:v1';

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

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

describe('public query persistence', () => {
  it('creates the shared query client with mobile-friendly defaults', () => {
    const client = createAppQueryClient();
    expect(client.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
    expect(client.getDefaultOptions().queries?.retry).toBe(1);
  });

  it('persists only successful public subject queries and restores them', () => {
    const source = createAppQueryClient();
    enablePublicQueryPersistence(source);
    source.setQueryData(['subjects', 'detail', 'subject-1'], { id: 'subject-1', name: 'برمجة 1' });
    source.setQueryData(['files', 'subject', 'subject-1', 'all'], [{ id: 'private-file' }]);
    vi.advanceTimersByTime(500);

    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(raw).toContain('subject-1');
    expect(raw).not.toContain('private-file');

    const restored = createAppQueryClient();
    restorePublicQueryCache(restored);
    expect(restored.getQueryData(['subjects', 'detail', 'subject-1'])).toEqual({ id: 'subject-1', name: 'برمجة 1' });
    expect(restored.getQueryData(['files', 'subject', 'subject-1', 'all'])).toBeUndefined();
  });

  it('drops expired or malformed cache entries safely', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: 1, state: {} }));
    restorePublicQueryCache(createAppQueryClient());
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    window.localStorage.setItem(STORAGE_KEY, '{invalid-json');
    expect(() => restorePublicQueryCache(createAppQueryClient())).not.toThrow();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
