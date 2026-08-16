/**
 * Request handlers for the worker
 */

import type { Env } from './env';
import type { Profile, FileRecord } from './types';
import type { UploadPresignRequest, ConfirmUploadRequest, DownloadPresignRequest, DeleteRequest, VerifyHashRequest } from './types';
import { corsResponse, corsError } from './cors';
import { getMaxSize, sanitizeObjectKey, validateObjectKey, getExtension, isAllowedExtension, checkMagicBytes } from './validation';
import { ALLOWED_MIME_TYPES, DEFAULT_SIGNED_EXPIRY, DEFAULT_UPLOAD_WINDOW_MIN } from './constants';
import { createPresignedUrl } from './r2';
import { getUploadLimit } from './types';
import { checkInMemoryRateLimit } from './accessControl';
import { fetchFileRecord, insertFileRecord, deleteFileRecord, checkDuplicateHash, insertCleanupRecord } from './supabase';
import { canAccessFile, canDeleteFile } from './accessControl';
import { trackPendingUpload, removePendingUpload } from './orphanFiles';

export async function handleUploadPresign(
  env: Env,
  request: Request,
  userId: string,
  role: Profile['role'],
): Promise<Response> {
  const body = await request.json() as UploadPresignRequest;
  const { file_name, file_size, file_type, subject_id, tab } = body;

  // Validate required fields
  if (!file_name || !file_size || !file_type || !subject_id || !tab) {
    return corsError(env, request, 400, 'Missing required fields');
  }

  // Validate tab
  if (!['summaries', 'exams', 'images', 'slides'].includes(tab)) {
    return corsError(env, request, 400, 'Invalid tab');
  }

  // Validate file extension
  const ext = getExtension(file_name);
  if (!isAllowedExtension(ext)) {
    return corsError(env, request, 400, 'File type not allowed');
  }

  // Validate file size
  const maxSize = getMaxSize(env);
  if (file_size > maxSize) {
    return corsError(env, request, 413, `File too large: maximum ${maxSize / (1024 * 1024)} MB`);
  }

  // Rate limit check
  const maxUploads = getUploadLimit(role);
  const windowMs = parseInt(env.UPLOAD_WINDOW_MINUTES || String(DEFAULT_UPLOAD_WINDOW_MIN), 10) * 60 * 1000;
  if (!checkInMemoryRateLimit(userId, maxUploads, windowMs)) {
    return corsError(env, request, 429, `Rate limit exceeded: maximum ${maxUploads} uploads per 10 minutes`);
  }

  // Generate a file ID (UUID) for the object key
  const fileId = crypto.randomUUID();
  const objectKey = sanitizeObjectKey(userId, fileId, ext);
  const mimeType = ALLOWED_MIME_TYPES[ext] || 'application/octet-stream';

  // Track this upload to prevent orphan files
  await trackPendingUpload(env, objectKey, userId);

  // Create presigned PUT URL
  const expiry = parseInt(env.SIGNED_URL_EXPIRY_SECONDS || String(DEFAULT_SIGNED_EXPIRY), 10);
  const presignedUrl = await createPresignedUrl(env, objectKey, 'PUT', expiry);

  return corsResponse(env, request, 200, {
    upload_url: presignedUrl,
    object_key: objectKey,
    file_id: fileId,
    mime_type: mimeType,
    expires_in: expiry,
  });
}

export async function handleUploadProxy(env: Env, request: Request, userId: string): Promise<Response> {
  const objectKey = request.headers.get('X-Object-Key') || '';
  if (!validateObjectKey(objectKey) || objectKey.split('/')[0] !== userId) {
    return corsError(env, request, 403, 'Invalid object key');
  }

  const declaredSize = Number(request.headers.get('Content-Length') || 0);
  if (declaredSize > getMaxSize(env)) {
    return corsError(env, request, 413, 'File too large');
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > getMaxSize(env)) {
    return corsError(env, request, 413, 'File too large or empty');
  }

  const ext = getExtension(objectKey);
  if (!isAllowedExtension(ext) || !checkMagicBytes(new Uint8Array(bytes.slice(0, 16)), ext)) {
    return corsError(env, request, 400, 'File content does not match its type');
  }

  await env.FILES_BUCKET.put(objectKey, bytes, {
    httpMetadata: { contentType: ALLOWED_MIME_TYPES[ext] || 'application/octet-stream' },
  });
  return corsResponse(env, request, 200, { success: true });
}

export async function handleConfirmUpload(env: Env, request: Request, userId: string): Promise<Response> {
  const body = await request.json() as ConfirmUploadRequest;
  const { object_key, file_id, file_name, file_type, file_size, file_hash, mime_type, subject_id, tab, batch_id } = body;

  // Validate object key
  if (!validateObjectKey(object_key)) {
    return corsError(env, request, 400, 'Invalid object key');
  }

  // Verify the object key belongs to this user
  const keyParts = object_key.split('/');
  if (keyParts[0] !== userId) {
    return corsError(env, request, 403, 'Object key does not belong to this user');
  }

  // Verify the R2 object actually exists
  const r2Object = await env.FILES_BUCKET.head(object_key);
  if (!r2Object) {
    await removePendingUpload(env, object_key);
    return corsError(env, request, 404, 'Object not found in R2 — upload may have failed');
  }

  // Verify the R2 object size matches
  if (r2Object.size !== file_size) {
    // Size mismatch — delete the orphaned R2 object
    await env.FILES_BUCKET.delete(object_key);
    await removePendingUpload(env, object_key);
    return corsError(env, request, 400, 'File size mismatch — object deleted');
  }

  // Check for duplicate hash within subject
  const isDuplicate = await checkDuplicateHash(env, userId, subject_id, file_hash);
  if (isDuplicate) {
    // Delete the duplicate R2 object
    await env.FILES_BUCKET.delete(object_key);
    await removePendingUpload(env, object_key);
    return corsError(env, request, 409, 'Duplicate file: a file with this hash already exists in this subject');
  }

  // Insert the DB record
  const record = {
    id: file_id,
    subject_id,
    tab,
    title: file_name,
    storage_path: object_key,
    file_url: object_key,
    object_key,
    storage_provider: 'r2',
    file_type: file_type.toLowerCase(),
    file_size,
    mime_type,
    file_hash,
    batch_id: batch_id || null,
    uploader_id: userId,
  };

  const inserted = await insertFileRecord(env, record);
  if (!inserted) {
    // DB save failed — delete the R2 object to avoid orphaned storage
    await env.FILES_BUCKET.delete(object_key);
    await removePendingUpload(env, object_key);
    return corsError(env, request, 500, 'Failed to save file record — R2 object cleaned up');
  }

  // Successfully saved, remove from pending uploads
  await removePendingUpload(env, object_key);

  return corsResponse(env, request, 200, {
    success: true,
    file: inserted,
  });
}

export async function handleDownloadPresign(env: Env, request: Request, userId: string, isAdmin: boolean): Promise<Response> {
  const body = await request.json() as DownloadPresignRequest;
  const { file_id, mode } = body;

  if (!file_id) {
    return corsError(env, request, 400, 'Missing file_id');
  }

  const file = await fetchFileRecord(env, file_id);
  if (!file) {
    return corsError(env, request, 404, 'File not found');
  }

  // Access control
  if (!canAccessFile(file, userId, isAdmin)) {
    return corsError(env, request, 403, 'Access denied');
  }

  // Determine the object key — support both old (storage_path) and new (object_key) files
  const objectKey = file.object_key || file.storage_path;
  if (!objectKey) {
    return corsError(env, request, 404, 'No storage path found for file');
  }

  // For old files in Supabase Storage (storage_provider is null or 'supabase'),
  // we can't generate R2 presigned URLs — the frontend should fall back to
  // Supabase signed URLs for those files.
  if (file.storage_provider !== 'r2') {
    return corsResponse(env, request, 200, {
      provider: 'supabase',
      storage_path: file.storage_path,
    });
  }

  // Validate the object key format
  if (!validateObjectKey(objectKey)) {
    return corsError(env, request, 500, 'Invalid object key in database');
  }

  const expiry = parseInt(env.SIGNED_URL_EXPIRY_SECONDS || String(DEFAULT_SIGNED_EXPIRY), 10);
  // Do not pass response-content-disposition - unreliable on iOS and some browsers
  // Frontend handles download via blob for consistent behavior across all devices
  const presignedUrl = await createPresignedUrl(env, objectKey, 'GET', expiry);

  return corsResponse(env, request, 200, {
    download_url: presignedUrl,
    provider: 'r2',
    expires_in: expiry,
  });
}

export async function handleDelete(env: Env, request: Request, userId: string, isAdmin: boolean): Promise<Response> {
  const body = await request.json() as DeleteRequest;
  const { file_id } = body;

  if (!file_id) {
    return corsError(env, request, 400, 'Missing file_id');
  }

  const file = await fetchFileRecord(env, file_id);
  if (!file) {
    return corsError(env, request, 404, 'File not found');
  }

  // Access control — only admin can delete (matching RLS)
  if (!canDeleteFile(file, userId, isAdmin)) {
    return corsError(env, request, 403, 'Only administrators can delete files');
  }

  // Delete the DB record first
  const dbDeleted = await deleteFileRecord(env, file_id);
  if (!dbDeleted) {
    return corsError(env, request, 500, 'Failed to delete file record');
  }

  // Delete the R2 object
  const objectKey = file.object_key || file.storage_path;
  let r2Deleted = true;

  if (objectKey && file.storage_provider === 'r2') {
    try {
      await env.FILES_BUCKET.delete(objectKey);
      // Also remove from pending uploads if somehow still there
      await removePendingUpload(env, objectKey);
    } catch {
      r2Deleted = false;
      await insertCleanupRecord(env, objectKey, 'delete_failed');
    }
  } else if (objectKey && file.storage_provider !== 'r2') {
    // Old Supabase Storage file — frontend handles Supabase storage deletion
    // Worker only handles R2 objects
  }

  if (!r2Deleted) {
    return corsResponse(env, request, 207, {
      success: false,
      message: 'Database record deleted, but R2 object deletion failed. Cleanup queued for retry.',
      file_id,
      cleanup_queued: true,
    });
  }

  return corsResponse(env, request, 200, {
    success: true,
    file_id,
  });
}

export async function handleVerifyHash(env: Env, request: Request, userId: string): Promise<Response> {
  const body = await request.json() as VerifyHashRequest;
  const { file_hash, subject_id } = body;

  if (!file_hash || !subject_id) {
    return corsError(env, request, 400, 'Missing file_hash or subject_id');
  }

  const isDuplicate = await checkDuplicateHash(env, userId, subject_id, file_hash);
  return corsResponse(env, request, 200, {
    is_duplicate: isDuplicate,
  });
}