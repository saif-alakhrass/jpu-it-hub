import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { FileTab } from '@/lib/types';
import { validateFile } from '@/lib/storage';

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

    for (const item of toUpload) {
      onProgress?.(item, 'uploading');
      const ext = item.file.name.split('.').pop() ?? 'bin';
      const path = `${opts.userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: upErr } = await supabase.storage.from('files').upload(path, item.file, { upsert: false });
      if (upErr) {
        onProgress?.(item, 'error', 'فشل رفع الملف');
        failCount++;
        if (!firstError) firstError = upErr.message;
        continue;
      }

      const { error: insErr } = await supabase.from('files').insert({
        subject_id: opts.subjectId,
        tab: opts.tab,
        title: item.title.trim() || item.file.name,
        storage_path: path,
        file_url: path,
        file_type: ext,
        file_size: item.file.size,
        batch_id: batchId,
        status: opts.canPublishDirectly ? 'approved' : 'pending',
      });

      if (insErr) {
        await supabase.storage.from('files').remove([path]);
        let msg = 'فشل حفظ الملف';
        if (insErr.message.includes('Rate limit')) msg = 'تم تجاوز حد الرفع المسموح';
        else if (insErr.message.includes('not allowed') || insErr.message.includes('too large')) msg = 'صيغة غير مدعومة أو حجم كبير';
        onProgress?.(item, 'error', msg);
        failCount++;
        if (!firstError) firstError = msg;
        continue;
      }

      setUploadTimes((prev) => [...prev, Date.now()]);
      onProgress?.(item, 'done');
      successCount++;
    }

    if (isBatch && batchId && successCount === 0) {
      await supabase.from('file_batches').delete().eq('id', batchId);
    }

    setUploading(false);
    return { successCount, failCount, error: firstError };
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
