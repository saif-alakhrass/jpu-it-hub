import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { FileRow } from '@/lib/types';
import { downloadFile, getSignedFileUrl, openFilePreview } from '@/lib/storage';
import { isR2Configured, requestDownloadPresign } from '@/lib/r2Client';

const CACHE_DURATION_MS = 55 * 60 * 1000;

export function useSignedFileAccess(onError: (message: string) => void) {
  const cache = useRef(new Map<string, { url: string; expiresAt: number }>();
  const [accessingFileId, setAccessingFileId] = useState<string | null>(null);

  const accessFile = useCallback(async (file: FileRow, mode: 'preview' | 'download') => {
    setAccessingFileId(file.id);
    try {
      const cached = cache.current.get(file.id);
      let url = cached && cached.expiresAt > Date.now() ? cached.url : null;

      if (!url) {
        const isR2File = file.storage_provider === 'r2' && file.object_key;

        if (isR2File && isR2Configured()) {
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData?.session?.access_token;
          if (!accessToken) {
            onError('يجب تسجيل الدخول للوصول إلى الملفات.');
            return;
          }
          const result = await requestDownloadPresign(accessToken, file.id);
          if (result?.download_url) {
            url = result.download_url;
          } else if (result?.provider === 'supabase' && result.storage_path) {
            url = await getSignedFileUrl(result.storage_path);
          }
        } else {
          url = await getSignedFileUrl(file.storage_path);
        }

        if (url) {
          cache.current.set(file.id, { url, expiresAt: Date.now() + CACHE_DURATION_MS });
        }
      }

      if (!url) {
        onError('تعذر إنشاء رابط آمن للملف. حاول مجددًا.');
        return;
      }

      if (mode === 'preview') openFilePreview(url);
      else await downloadFile(url, file.title);
    } catch {
      onError('حدث خطأ أثناء الوصول إلى الملف.');
    } finally {
      setAccessingFileId(null);
    }
  }, [onError]);

  return { accessingFileId, accessFile };
}
