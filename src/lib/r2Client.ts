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

export class WorkerRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkerRequestError';
  }
}

async function throwWorkerError(response: Response): Promise<never> {
  let message = `تعذر الاتصال بخدمة الملفات (${response.status})`;
  try {
    const body = await response.json() as { error?: string };
    if (body.error) message = body.error;
  } catch {
    // Keep the safe status-based error when the response is not JSON.
  }
  throw new WorkerRequestError(message);
}

/**
 * Request a presigned PUT URL from the Worker for uploading a file to R2.
 */
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
  if (!res.ok) return throwWorkerError(res);
  return res.json() as Promise<UploadPresignResult>;
}

/**
 * Upload the file binary to R2 using the presigned PUT URL.
 * The Content-Type header must match what was specified during presigning.
 */
export async function uploadToR2(
  _presignUrl: string,
  file: File,
  mimeType: string,
  accessToken: string,
  objectKey: string,
): Promise<boolean> {
  // Direct browser PUTs to private R2 can fail after the object is accepted
  // due to browser-level CORS handling. Use the authenticated Worker path as
  // the reliable upload transport; it writes only the generated object key.
  const fallback = await fetch(`${WORKER_URL}/upload-proxy`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': mimeType,
      'X-Object-Key': objectKey,
    },
    body: file,
  });
  return fallback.ok;
}

/**
 * Compute SHA-256 hash of a file in the browser.
 */
export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check if a file hash already exists for a subject (deduplication check).
 */
export async function checkHashDuplicate(
  accessToken: string,
  fileHash: string,
  subjectId: string,
): Promise<boolean> {
  const res = await fetch(`${WORKER_URL}/verify-hash`, {
    method: 'POST',
    headers: getAuthHeaders(accessToken),
    body: JSON.stringify({ file_hash: fileHash, subject_id: subjectId }),
  });
  if (!res.ok) return false;
  const data = await res.json() as { is_duplicate: boolean };
  return data.is_duplicate;
}

/**
 * Confirm that a file was uploaded to R2 and save the DB record via the Worker.
 * If the DB save fails, the Worker deletes the R2 object automatically.
 */
export async function confirmUpload(
  accessToken: string,
  params: {
    object_key: string;
    file_id: string;
    file_name: string;
    file_type: string;
    file_size: number;
    file_hash: string;
    mime_type: string;
    subject_id: string;
    tab: string;
    batch_id?: string | null;
  },
): Promise<{ success: boolean; file?: unknown } | null> {
  const res = await fetch(`${WORKER_URL}/confirm-upload`, {
    method: 'POST',
    headers: getAuthHeaders(accessToken),
    body: JSON.stringify(params),
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ success: boolean; file?: unknown }>;
}

/**
 * Request a presigned GET URL from the Worker for downloading a file from R2.
 * For legacy Supabase Storage files, returns provider: 'supabase' and the
 * storage_path — the caller should fall back to Supabase signed URLs.
 */
export async function requestDownloadPresign(
  accessToken: string,
  fileId: string,
): Promise<DownloadPresignResult | null> {
  const res = await fetch(`${WORKER_URL}/download-presign`, {
    method: 'POST',
    headers: getAuthHeaders(accessToken),
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<DownloadPresignResult>;
}

/**
 * Delete a file via the Worker — removes the R2 object and the DB record.
 * If R2 deletion fails, a cleanup record is queued for retry.
 */
export async function deleteFileViaWorker(
  accessToken: string,
  fileId: string,
): Promise<DeleteResult | null> {
  const res = await fetch(`${WORKER_URL}/delete`, {
    method: 'POST',
    headers: getAuthHeaders(accessToken),
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<DeleteResult>;
}

