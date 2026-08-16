import { supabase } from '@/lib/supabase';
import {
  MAX_FILE_SIZE_MB,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  UPLOAD_MAX_PER_WINDOW,
  UPLOAD_WINDOW_MS,
} from '@/lib/constants';
import { classifyError, NetworkError, logError } from './errorHandler';

export { MAX_FILE_SIZE_MB, MAX_FILE_SIZE_BYTES, UPLOAD_MAX_PER_WINDOW };
export { ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS };

const SIGNED_URL_EXPIRY = 3600;
const CLEANUP_DELAY_MS = 100;

export interface DownloadResult {
  success: boolean;
  error?: string;
}

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

export async function downloadFile(url: string, fallbackName: string): Promise<DownloadResult> {
  if (!url) return { success: false, error: 'No URL provided' };
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const error = new NetworkError(`Download failed (${res.status})`, { 
        url, 
        status: res.status,
        fallbackName 
      });
      logError(error, { url, fallbackName });
      throw error;
    }
    const blob = await res.blob();
    saveBlob(blob, fallbackName);
    return { success: true };
  } catch (error) {
    const appError = classifyError(error);
    logError(appError, { url, fallbackName });
    
    // Fallback: try direct download with download attribute
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = fallbackName || 'file';
      a.target = '_blank';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
      }, CLEANUP_DELAY_MS);
      return { success: true };
    } catch {
      // Last resort: open in new tab
      window.open(url, '_blank');
      return { success: false, error: appError.message };
    }
  }
}

function saveBlob(blob: Blob, fallbackName: string): void {
  const filename = fallbackName || 'file';
  const objectUrl = URL.createObjectURL(blob);
  
  // iOS Safari workaround: use FileReader for better compatibility
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  
  if (isIOS) {
    const reader = new FileReader();
    reader.onload = () => {
      const a = document.createElement('a');
      a.href = reader.result as string;
      a.download = filename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
      }, CLEANUP_DELAY_MS);
    };
    reader.readAsDataURL(blob);
  } else {
    // Standard approach for other browsers
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    }, CLEANUP_DELAY_MS);
  }
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
