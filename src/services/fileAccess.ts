import { supabase } from '@/lib/supabase';
import { getSignedFileUrl } from '@/lib/storage';
import { deleteFileViaWorker, isR2Configured, requestDownloadPresign } from '@/lib/r2Client';
import { deleteFile, removeStorageObjects } from '@/services/files';
import type { FileRow } from '@/lib/types';

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function isWorkerBackedFile(file: FileRow): boolean {
  return file.storage_provider === 'r2' && Boolean(file.object_key) && isR2Configured();
}

export type ResolvedFileAccess =
  | { kind: 'url'; url: string }
  | { kind: 'storagePath'; storagePath: string }
  | { kind: 'unauthenticated' }
  | { kind: 'unavailable' };

/**
 * Resolves how a file can be read: a Worker presigned URL for R2 objects, or a
 * Supabase Storage path for legacy files (including R2 files the Worker still
 * reports as Supabase-hosted).
 */
export async function resolveFileAccess(file: FileRow, mode: 'preview' | 'download'): Promise<ResolvedFileAccess> {
  if (!isWorkerBackedFile(file)) {
    return { kind: 'storagePath', storagePath: file.storage_path };
  }
  const accessToken = await getAccessToken();
  if (!accessToken) return { kind: 'unauthenticated' };
  const result = await requestDownloadPresign(accessToken, file.id, mode);
  if (result?.download_url) return { kind: 'url', url: result.download_url };
  if (result?.provider === 'supabase' && result.storage_path) {
    return { kind: 'storagePath', storagePath: result.storage_path };
  }
  return { kind: 'unavailable' };
}

export async function getFilePreviewUrl(file: FileRow): Promise<string | null> {
  const access = await resolveFileAccess(file, 'preview');
  if (access.kind === 'url') return access.url;
  if (access.kind === 'storagePath') return getSignedFileUrl(access.storagePath);
  return null;
}

export interface DeleteStoredFileResult {
  ok: boolean;
  storageOk: boolean;
  cleanupQueued?: boolean;
  message?: string;
}

/**
 * Deletes a file everywhere it lives: R2 objects go through the Worker (which
 * owns the credentials and queues a retry when the object cannot be removed),
 * legacy files drop the storage object first and the record afterwards.
 */
export async function deleteStoredFile(file: FileRow, accessToken?: string | null): Promise<DeleteStoredFileResult> {
  if (file.storage_provider === 'r2') {
    const token = accessToken ?? await getAccessToken();
    if (!token || !isR2Configured()) {
      return { ok: false, storageOk: false, message: 'خدمة حذف الملفات الآمنة غير متاحة الآن.' };
    }
    const result = await deleteFileViaWorker(token, file.id);
    if (!result) return { ok: false, storageOk: false, message: 'تعذر الاتصال بخدمة حذف الملفات.' };
    if (!result.success) {
      return { ok: true, storageOk: false, cleanupQueued: result.cleanup_queued, message: result.message };
    }
    return { ok: true, storageOk: true };
  }

  const storageOk = file.storage_path ? await removeStorageObjects([file.storage_path]) : true;
  if (!storageOk) return { ok: false, storageOk: false, message: 'تعذر حذف النسخة المخزنة؛ لم يُحذف سجل الملف.' };
  const recordDeleted = await deleteFile(file.id);
  return { ok: recordDeleted, storageOk, message: recordDeleted ? undefined : 'تعذر حذف سجل الملف.' };
}
