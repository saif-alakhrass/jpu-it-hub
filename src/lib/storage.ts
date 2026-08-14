import { supabase } from '@/lib/supabase';
import {
  MAX_FILE_SIZE_MB,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  UPLOAD_MAX_PER_WINDOW,
  UPLOAD_WINDOW_MS,
} from '@/lib/constants';

export { MAX_FILE_SIZE_MB, MAX_FILE_SIZE_BYTES, UPLOAD_MAX_PER_WINDOW };
export { ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS };

const SIGNED_URL_EXPIRY = 3600;

export async function getSignedFileUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('files')
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function downloadFileViaStorage(storagePath: string, fallbackName: string): Promise<void> {
  const { data, error } = await supabase.storage.from('files').download(storagePath);
  if (error || !data) throw error ?? new Error('Download failed');
  saveBlob(data, fallbackName);
}

export function openFilePreview(url: string): void {
  window.open(url, '_blank');
}

export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  if (!url) return;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    saveBlob(blob, fallbackName);
  } catch {
    window.location.assign(url);
  }
}

function saveBlob(blob: Blob, fallbackName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fallbackName || 'file';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export function canUploadNow(recentTimestamps: number[], maxUploads = UPLOAD_MAX_PER_WINDOW): boolean {
  const cutoff = Date.now() - UPLOAD_WINDOW_MS;
  return recentTimestamps.filter((t) => t > cutoff).length < maxUploads;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileIcon(ext: string): string {
  const e = ext.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(e)) return 'Image';
  if (e === 'pdf') return 'FileText';
  if (['doc', 'docx'].includes(e)) return 'FileType';
  if (['ppt', 'pptx'].includes(e)) return 'Presentation';
  return 'File';
}

export function validateFile(file: File): { ok: true } | { ok: false; message: string } {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, message: `حجم الملف يتجاوز الحد الأقصى (${MAX_FILE_SIZE_MB} ميجابايت)` };
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { ok: false, message: 'صيغة الملف غير مدعومة. المسموح: PDF, DOC, DOCX, PPT, PPTX, PNG, JPG' };
  }
  if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
    return { ok: false, message: 'نوع الملف غير مدعوم. المسموح: PDF, DOC, DOCX, PPT, PPTX, PNG, JPG' };
  }
  return { ok: true };
}
