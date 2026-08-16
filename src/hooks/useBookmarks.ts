import { useCallback, useEffect, useState } from 'react';
import {
  getUserBookmarks,
  getUserFolders,
  removeBookmarkById,
  getBookmarkedIds,
  addBookmark,
  removeBookmark,
} from '@/services/bookmarks';
import { getUserErrorMessage } from '@/lib/serviceError';
import type { BookmarkWithFile } from '@/lib/types';

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<BookmarkWithFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBookmarks(await getUserBookmarks());
    } catch (err) {
      setError(getUserErrorMessage(err, 'تعذر تحميل المحفوظات. حاول مجددًا.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function remove(id: string): Promise<void> {
    await removeBookmarkById(id);
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  }

  return { bookmarks, loading, error, reload, remove };
}

export function useBookmarkedIds(resourceIds: string[], enabled: boolean) {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || resourceIds.length === 0) {
      setIds(new Set());
      return;
    }
    let active = true;
    (async () => {
      try {
        const result = await getBookmarkedIds(resourceIds);
        if (active) setIds(result);
      } catch (err) {
        // Bookmark highlighting is non-critical: keep the file list usable.
        console.error('Failed to load bookmarked ids', err);
      }
    })();
    return () => { active = false; };
  }, [resourceIds, enabled]);

  return { ids, setIds };
}

export { addBookmark, removeBookmark, getUserFolders };
