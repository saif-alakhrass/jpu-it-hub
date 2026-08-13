import { supabase } from '@/lib/supabase';
import {
  MAX_FILE_SIZE_MB,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  UPLOAD_MAX_PER_WINDOW_BY_ROLE,
  UPLOAD_WINDOW_MS,
} from '@/lib/constants';
import type { Role } from '@/lib/types';

export { MAX_FILE_SIZE_MB, MAX_FILE_SIZE_BYTES, UPLOAD_MAX_PER_WINDOW_BY_ROLE };
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
  const url = await getSignedFileUrl(storagePath);
  if (!url) return;
  await downloadFile(url, fallbackName);
}

export function openFilePreview(url: string): void {
  window.open(url, '_blank');
}

export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  if (!url) return;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fallbackName || 'file';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, '_blank');
  }
}

export function canUploadNow(recentTimestamps: number[], maxUploads: number): boolean {
  const cutoff = Date.now() - UPLOAD_WINDOW_MS;
  return recentTimestamps.filter((t) => t > cutoff).length < maxUploads;
}

export function getUploadLimit(role: Role): number {
  return UPLOAD_MAX_PER_WINDOW_BY_ROLE[role];
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
