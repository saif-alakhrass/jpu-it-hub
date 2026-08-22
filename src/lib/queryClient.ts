import { dehydrate, hydrate, QueryClient, type QueryKey } from '@tanstack/react-query';

const PUBLIC_CACHE_KEY = 'jpu-it-hub:public-query-cache:v1';
const PUBLIC_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
const PERSIST_DEBOUNCE_MS = 500;

interface StoredPublicCache {
  savedAt: number;
  state: ReturnType<typeof dehydrate>;
}

export function isPublicQueryKey(queryKey: QueryKey): boolean {
  return queryKey[0] === 'subjects';
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 30,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

export function restorePublicQueryCache(queryClient: QueryClient): void {
  try {
    const raw = window.localStorage.getItem(PUBLIC_CACHE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw) as StoredPublicCache;
    if (!stored.savedAt || Date.now() - stored.savedAt > PUBLIC_CACHE_MAX_AGE) {
      window.localStorage.removeItem(PUBLIC_CACHE_KEY);
      return;
    }
    hydrate(queryClient, stored.state);
  } catch {
    try { window.localStorage.removeItem(PUBLIC_CACHE_KEY); } catch { /* unavailable storage */ }
  }
}

export function enablePublicQueryPersistence(queryClient: QueryClient): void {
  restorePublicQueryCache(queryClient);
  let timer: number | undefined;

  const persist = () => {
    if (timer) window.clearTimeout(timer);
    timer = undefined;
    try {
      const state = dehydrate(queryClient, {
        shouldDehydrateQuery: (query) => query.state.status === 'success' && isPublicQueryKey(query.queryKey),
      });
      const stored: StoredPublicCache = { savedAt: Date.now(), state };
      window.localStorage.setItem(PUBLIC_CACHE_KEY, JSON.stringify(stored));
    } catch {
      // Storage can be unavailable or full; in-memory caching keeps working.
    }
  };

  queryClient.getQueryCache().subscribe((event) => {
    if (!isPublicQueryKey(event.query.queryKey)) return;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(persist, PERSIST_DEBOUNCE_MS);
  });
  window.addEventListener('pagehide', persist);
}
