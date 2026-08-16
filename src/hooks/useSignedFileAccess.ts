import { useCallback, useRef, useState } from 'react';
import type { FileRow } from '@/lib/types';
import { downloadFile, downloadFileViaStorage, getSignedFileUrl } from '@/lib/storage';
import { resolveFileAccess } from '@/services/fileAccess';

// R2 URLs currently expire after five minutes. Keep the cache shorter so a
// preview never reuses a URL that the Worker has already expired.
const CACHE_DURATION_MS = 4 * 60 * 1000;

export function useSignedFileAccess(onError: (message: string) => void) {
  const cache = useRef(new Map<string, { url: string; expiresAt: number }>());
  const [accessingFileId, setAccessingFileId] = useState<string | null>(null);

  const accessFile = useCallback(async (file: FileRow, mode: 'preview' | 'download') => {
    setAccessingFileId(file.id);
    try {
      const cacheKey = `${file.id}:${mode}`;
      const cached = cache.current.get(cacheKey);
      let url = cached && cached.expiresAt > Date.now() ? cached.url : null;

      if (!url) {
        const access = await resolveFileAccess(file, mode);

        if (access.kind === 'unauthenticated') {
          onError('يجب تسجيل الدخول للوصول إلى الملفات.');
          return;
        }
        if (access.kind === 'url') {
          url = access.url;
        } else if (access.kind === 'storagePath') {
          // Legacy Supabase Storage file (no R2 provider or Worker not configured)
          if (mode === 'download') {
            await downloadFileViaStorage(access.storagePath, file.title);
            return;
          }
          url = await getSignedFileUrl(access.storagePath);
        }

        if (url) {
          cache.current.set(cacheKey, {
            url,
            expiresAt: Date.now() + CACHE_DURATION_MS,
          });
        }
      }

      if (!url) {
        onError('تعذر إنشاء رابط آمن للملف. حاول مجددًا.');
        return;
      }

      if (mode === 'preview') return url;
      await downloadFile(url, file.title);
    } catch {
      onError('حدث خطأ أثناء الوصول إلى الملف.');
    } finally {
      setAccessingFileId(null);
    }
  }, [onError]);

  return { accessingFileId, accessFile };
}
