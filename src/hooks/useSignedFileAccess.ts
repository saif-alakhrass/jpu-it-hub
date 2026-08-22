import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { FileRow } from '@/lib/types';
import { downloadFileViaStorage, getSignedFileUrl, isIosDevice, saveBlob } from '@/lib/storage';
import { downloadR2File, isR2Configured, requestDownloadPresign, requestNativeDownloadUrl } from '@/lib/r2Client';

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
        const isR2File = file.storage_provider === 'r2' && file.object_key;

        if (isR2File && isR2Configured()) {
          // Get presigned URL from the Cloudflare Worker
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData?.session?.access_token;
          if (!accessToken) {
            onError('يجب تسجيل الدخول للوصول إلى الملفات.');
            return;
          }
          if (mode === 'download') {
            if (isIosDevice()) {
              const nativeUrl = await requestNativeDownloadUrl(accessToken, file.id);
              window.location.assign(nativeUrl);
              return;
            }
            const extension = (file.file_type ?? '').toLowerCase();
            const downloadName = extension && !file.title.toLowerCase().endsWith(`.${extension}`)
              ? `${file.title}.${extension}`
              : file.title;
            const blob = await downloadR2File(accessToken, file.id);
            saveBlob(blob, downloadName);
            return;
          }
          const result = await requestDownloadPresign(accessToken, file.id, mode);
          if (result?.download_url) {
            url = result.download_url;
          } else if (result?.provider === 'supabase' && result.storage_path) {
            // Defensive compatibility for a record whose provider metadata
            // changed while this page was open. This branch is preview-only.
            url = await getSignedFileUrl(result.storage_path);
          }
        } else {
          // Legacy Supabase Storage file (no R2 provider or Worker not configured)
          if (mode === 'download') {
            await downloadFileViaStorage(file.storage_path, file.title);
            return;
          }
          url = await getSignedFileUrl(file.storage_path);
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

      return url;
    } catch {
      onError('حدث خطأ أثناء الوصول إلى الملف.');
    } finally {
      setAccessingFileId(null);
    }
  }, [onError]);

  return { accessingFileId, accessFile };
}
