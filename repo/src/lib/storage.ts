import { supabase } from '@/lib/supabase';

const SIGNED_URL_EXPIRY = 3600;

export async function getSignedFileUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('files')
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export const UPLOAD_MAX_PER_WINDOW = 5;
const UPLOAD_WINDOW_MS = 10 * 60 * 1000;

export function canUploadNow(recentTimestamps: number[]): boolean {
  const cutoff = Date.now() - UPLOAD_WINDOW_MS;
  return recentTimestamps.filter((t) => t > cutoff).length < UPLOAD_MAX_PER_WINDOW;
}

export const MAX_FILE_SIZE_MB = 20;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const ALLOWED_MIME_TYPES: readonly string[] = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
];

export const ALLOWED_EXTENSIONS: readonly string[] = [
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg',
];

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
