import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { FileTab } from '@/lib/types';
import { validateFile } from '@/lib/storage';
import { saveLocalFile } from '@/lib/localFileStore';
import {
  isR2Configured,
  requestUploadPresign,
  uploadToR2,
  confirmUpload,
  computeFileHash,
  checkHashDuplicate,
  requestDownloadPresign,
} from '@/lib/r2Client';

export interface QueuedFile {
  id: string;
  file: File;
  title: string;
  status: 'waiting' | 'uploading' | 'done' | 'error';
  error?: string;
}

export interface UploadResult {
  successCount: number;
  failCount: number;
  error: string | null;
}

export function useUpload() {
  const [uploading, setUploading] = useState(false);
  const [uploadTimes, setUploadTimes] = useState<number[]>([]);

  async function uploadBatch(
    files: QueuedFile[],
    opts: {
      subjectId: string;
      tab: FileTab;
      userId: string;
      canPublishDirectly: boolean;
      batchTitle?: string;
      tabLabel: string;
    },
    onProgress?: (item: QueuedFile, status: QueuedFile['status'], error?: string) => void,
  ): Promise<UploadResult> {
    const toUpload = files.filter((f) => f.status === 'waiting');
    if (toUpload.length === 0) return { successCount: 0, failCount: 0, error: null };

    setUploading(true);
    let successCount = 0;
    let failCount = 0;
    let firstError: string | null = null;

    const isBatch = toUpload.length > 1;
    let batchId: string | null = null;

    // Create batch record if multiple files
    if (isBatch) {
      const d = new Date().toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' });
      const title = opts.batchTitle?.trim() || `${opts.tabLabel} - مجموعة (${toUpload.length} ملفات) - ${d}`;
      const { data: batch, error: batchErr } = await supabase
        .from('file_batches')
        .insert({
          subject_id: opts.subjectId,
          tab: opts.tab,
          title,
        })
        .select('id')
        .maybeSingle();
      if (batchErr || !batch) {
        setUploading(false);
        return { successCount: 0, failCount: 0, error: 'فشل إنشاء المجموعة: ' + (batchErr?.message ?? 'خطأ غير معروف') };
      }
      batchId = batch.id;
    }

    // Get access token for Worker authentication
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    for (const item of toUpload) {
      onProgress?.(item, 'uploading');

      const ext = item.file.name.split('.').pop() ?? 'bin';

      if (isR2Configured() && accessToken) {
        // ---- R2 upload path ----
        const result = await uploadViaR2(item, ext, opts, batchId, accessToken);
        if (result.success) {
          successCount++;
          setUploadTimes((prev) => [...prev, Date.now()]);
          onProgress?.(item, 'done');
        } else {
          failCount++;
          if (!firstError) firstError = result.error;
          onProgress?.(item, 'error', result.error);
        }
      } else {
        // ---- Local storage path (no remote backend configured) ----
        const result = await uploadViaLocal(item, ext, opts, batchId);
        if (result.success) {
          successCount++;
          setUploadTimes((prev) => [...prev, Date.now()]);
          onProgress?.(item, 'done');
        } else {
          failCount++;
          if (!firstError) firstError = result.error;
          onProgress?.(item, 'error', result.error);
        }
      }
    }

    // Clean up empty batch
    if (isBatch && batchId && successCount === 0) {
      await supabase.from('file_batches').delete().eq('id', batchId);
    }

    setUploading(false);
    return { successCount, failCount, error: firstError };
  }

  async function uploadViaR2(
    item: QueuedFile,
    ext: string,
    opts: {
      subjectId: string;
      tab: FileTab;
      userId: string;
      canPublishDirectly: boolean;
      tabLabel: string;
    },
    batchId: string | null,
    accessToken: string,
  ): Promise<{ success: boolean; error: string }> {
    try {
      // 1. Request presigned PUT URL from Worker
      const presign = await requestUploadPresign(accessToken, {
        file_name: item.file.name,
        file_size: item.file.size,
        file_type: ext,
        subject_id: opts.subjectId,
        tab: opts.tab,
        batch_id: batchId,
      });
      if (!presign) {
        return { success: false, error: 'فشل الحصول على رابط الرفع' };
      }

      // 2. Upload file binary to R2 via presigned URL
      const uploaded = await uploadToR2(
        presign.upload_url,
        item.file,
        presign.mime_type,
        accessToken,
        presign.object_key,
      );
      if (!uploaded) {
        return { success: false, error: 'فشل رفع الملف إلى التخزين' };
      }

      // 3. Compute SHA-256 hash for dedup
      const fileHash = await computeFileHash(item.file);

      // 4. Check for duplicate (pre-confirm)
      const isDup = await checkHashDuplicate(accessToken, fileHash, opts.subjectId);
      if (isDup) {
        // Clean up the R2 object since we won't save the DB record
        // (Worker handles cleanup on confirm failure, but we can avoid it)
        return { success: false, error: 'ملف مكرر: يوجد ملف بنفس المحتوى في هذه المادة' };
      }

      // 5. Confirm upload via Worker (saves DB record, verifies R2 object exists)
      const confirmed = await confirmUpload(accessToken, {
        object_key: presign.object_key,
        file_id: presign.file_id,
        file_name: item.title.trim() || item.file.name,
        file_type: ext,
        file_size: item.file.size,
        file_hash: fileHash,
        mime_type: presign.mime_type,
        subject_id: opts.subjectId,
        tab: opts.tab,
        batch_id: batchId,
      });
      if (!confirmed || !confirmed.success) {
        // The Worker may have saved the record even if a browser-side CORS
        // error hid its response. Verify the exact new file before reporting
        // failure; this does not expose a URL or bypass authorization.
        const recovered = await requestDownloadPresign(accessToken, presign.file_id);
        if (recovered) return { success: true, error: '' };
        return { success: false, error: 'فشل حفظ سجل الملف' };
      }

      return { success: true, error: '' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع أثناء الرفع',
      };
    }
  }

  async function uploadViaLocal(
    item: QueuedFile,
    ext: string,
    opts: {
      subjectId: string;
      tab: FileTab;
      userId: string;
      canPublishDirectly: boolean;
      tabLabel: string;
    },
    batchId: string | null,
  ): Promise<{ success: boolean; error: string }> {
    try {
      const { data: fileRecord, error: insErr } = await supabase
        .from('files')
        .insert({
          subject_id: opts.subjectId,
          tab: opts.tab,
          title: item.title.trim() || item.file.name,
          storage_path: `local/${item.id}`,
          file_url: `local/${item.id}`,
          file_type: ext,
          file_size: item.file.size,
          batch_id: batchId,
          storage_provider: 'local',
          object_key: item.id,
        })
        .select('id')
        .maybeSingle();

      if (insErr || !fileRecord) {
        let msg = 'فشل حفظ الملف';
        if (insErr?.message.includes('Rate limit')) msg = 'تم تجاوز حد الرفع المسموح';
        else if (insErr?.message.includes('not allowed') || insErr?.message.includes('too large')) msg = 'صيغة غير مدعومة أو حجم كبير';
        return { success: false, error: msg };
      }

      await saveLocalFile(fileRecord.id, item.file);
      return { success: true, error: '' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع أثناء الرفع',
      };
    }
  }

  function validateQueue(fileList: FileList | File[]): QueuedFile[] {
    return Array.from(fileList).map((f) => {
      const v = validateFile(f);
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${f.name}`,
        file: f,
        title: f.name.replace(/\.[^.]+$/, ''),
        status: v.ok ? 'waiting' : 'error',
        error: v.ok ? undefined : v.message,
      };
    });
  }

  return { uploading, uploadTimes, uploadBatch, validateQueue };
}
