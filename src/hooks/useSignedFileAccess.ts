import { useCallback, useRef, useState } from 'react';
import type { FileRow } from '@/lib/types';
import { downloadFile, getSignedFileUrl, openFilePreview } from '@/lib/storage';

const CACHE_DURATION_MS = 55 * 60 * 1000;

export function useSignedFileAccess(onError: (message: string) => void) {
  const cache = useRef(new Map<string, { url: string; expiresAt: number }>());
  const [accessingFileId, setAccessingFileId] = useState<string | null>(null);

  const accessFile = useCallback(async (file: FileRow, mode: 'preview' | 'download') => {
    setAccessingFileId(file.id);
    try {
      const cached = cache.current.get(file.id);
      let url = cached && cached.expiresAt > Date.now() ? cached.url : null;

      if (!url) {
        url = await getSignedFileUrl(file.storage_path);
        if (url) {
          cache.current.set(file.id, {
            url,
            expiresAt: Date.now() + CACHE_DURATION_MS,
          });
        }
      }

      if (!url) {
        onError('تعذر إنشاء رابط آمن للملف. حاول مجددًا.');
        return;
      }

      if (mode === 'preview') openFilePreview(url);
      else await downloadFile(url, file.title);
    } finally {
      setAccessingFileId(null);
    }
  }, [onError]);

  return { accessingFileId, accessFile };
}
