/**
 * R2 Storage Client — communicates with the Cloudflare Worker to get
 * presigned URLs for upload and download, confirm uploads, and delete files.
 *
 * The Worker URL is configured via VITE_R2_WORKER_URL (no secrets here —
 * the Worker holds R2 credentials, not the frontend).
 */

const WORKER_URL = (import.meta.env.VITE_R2_WORKER_URL as string) || '';

export function isR2Configured(): boolean {
  return Boolean(WORKER_URL);
}

export function getWorkerUrl(): string {
  return WORKER_URL;
}

function getAuthHeaders(accessToken: string): Headers {
  return new Headers({
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  });
}

export interface UploadPresignResult {
  upload_url: string;
  object_key: string;
  file_id: string;
  mime_type: string;
  expires_in: number;
}

export interface DownloadPresignResult {
  download_url?: string;
  provider: 'r2' | 'supabase';
  storage_path?: string;
  expires_in?: number;
}

export interface DeleteResult {
  success: boolean;
  cleanup_queued?: boolean;
  message?: string;
}

export async function requestUploadPresign(
  accessToken: string,
  params: {
    file_name: string;
    file_size: number;
    file_type: string;
    subject_id: string;
    tab: string;
    batch_id?: string | null;
  },
): Promise<UploadPresignResult | null> {
  const res = await fetch(`${WORKER_URL}/upload-presign`, {
    method: 'POST',
    headers: getAuthHeaders(accessToken),
    body: JSON.stringify(params),
  });
  if (!res.ok) return null;
  return res.json() as Promise<UploadPresignResult>;
}

export async function uploadToR2(presignUrl: string, file: File, mimeType: string): Promise<boolean> {
  const res = await fetch(presignUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: file });
  return res.ok;
}

export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function checkHashDuplicate(accessToken: string, fileHash: string, subjectId: string): Promise<boolean> {
  const res = await fetch(`${WORKER_URL}/verify-hash`, {
    method: 'POST', headers: getAuthHeaders(accessToken),
    body: JSON.stringify({ file_hash: fileHash, subject_id: subjectId }),
  });
  if (!res.ok) return false;
  const data = await res.json() as { is_duplicate: boolean };
  return data.is_duplicate;
}

export async function confirmUpload(
  accessToken: string,
  params: {
    object_key: string; file_id: string; file_name: string; file_type: string;
    file_size: number; file_hash: string; mime_type: string;
    subject_id: string; tab: string; batch_id?: string | null;
  },
): Promise<{ success: boolean; file?: unknown } | null> {
  const res = await fetch(`${WORKER_URL}/confirm-upload`, {
    method: 'POST', headers: getAuthHeaders(accessToken),
    body: JSON.stringify(params),
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ success: boolean; file?: unknown }>;
}

export async function requestDownloadPresign(accessToken: string, fileId: string): Promise<DownloadPresignResult | null> {
  const res = await fetch(`${WORKER_URL}/download-presign`, {
    method: 'POST', headers: getAuthHeaders(accessToken),
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<DownloadPresignResult>;
}

export async function deleteFileViaWorker(accessToken: string, fileId: string): Promise<DeleteResult | null> {
  const res = await fetch(`${WORKER_URL}/delete`, {
    method: 'POST', headers: getAuthHeaders(accessToken),
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<DeleteResult>;
}
