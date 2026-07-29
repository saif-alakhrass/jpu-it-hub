import { useCallback, useEffect, useState } from 'react';
import {
  getUserBookmarks,
  getUserFolders,
  removeBookmarkById,
  getBookmarkedIds,
  addBookmark,
  removeBookmark,
} from '@/services/bookmarks';
import type { BookmarkWithFile } from '@/lib/types';

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<BookmarkWithFile[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const data = await getUserBookmarks();
    setBookmarks(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function remove(id: string): Promise<boolean> {
    const ok = await removeBookmarkById(id);
    if (ok) setBookmarks((prev) => prev.filter((b) => b.id !== id));
    return ok;
  }

  return { bookmarks, loading, reload, remove };
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
      const result = await getBookmarkedIds(resourceIds);
      if (active) setIds(result);
    })();
    return () => { active = false; };
  }, [resourceIds, enabled]);

  return { ids, setIds };
}

export { addBookmark, removeBookmark, getUserFolders };
