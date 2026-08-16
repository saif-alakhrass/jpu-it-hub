/**
 * Validation utilities
 */

import { ALLOWED_EXTENSIONS, MAGIC_BYTES, DEFAULT_MAX_SIZE, DEFAULT_UPLOAD_WINDOW_MIN, DEFAULT_SIGNED_EXPIRY } from './constants';
import type { AllowedExt } from './constants';
import type { Env } from './env';

export function getExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1]!.toLowerCase() : '';
}

export function isAllowedExtension(ext: string): ext is AllowedExt {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

export function checkMagicBytes(data: Uint8Array, ext: string): boolean {
  const sig = MAGIC_BYTES[ext];
  if (!sig) return true; // No signature defined — allow (e.g. doc/docx share OLE2)
  if (data.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (data[i] !== sig[i]) return false;
  }
  return true;
}

export function getMaxSize(env: Env): number {
  return parseInt(env.MAX_FILE_SIZE_BYTES || String(DEFAULT_MAX_SIZE), 10);
}

// ---------------------------------------------------------------------------
// Object key sanitization (path traversal / injection protection)
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizeObjectKey(userId: string, fileId: string, ext: string): string {
  // Validate userId is a UUID
  if (!UUID_RE.test(userId)) {
    throw new Error('Invalid user ID format');
  }
  // Validate fileId is a UUID
  if (!UUID_RE.test(fileId)) {
    throw new Error('Invalid file ID format');
  }
  // Validate extension is in allowlist
  if (!isAllowedExtension(ext)) {
    throw new Error('Invalid file extension');
  }
  // Build key: {userId}/{fileId}.{ext} — no user-controlled path segments
  return `${userId}/${fileId}.${ext}`;
}

export function validateObjectKey(key: string): boolean {
  // Must match: {uuid}/{uuid}.{ext}
  const parts = key.split('/');
  if (parts.length !== 2) return false;
  const [userId, filePart] = parts as [string, string];
  if (!UUID_RE.test(userId)) return false;
  const dotIdx = filePart.lastIndexOf('.');
  if (dotIdx < 0) return false;
  const fileId = filePart.substring(0, dotIdx);
  const ext = filePart.substring(dotIdx + 1);
  return UUID_RE.test(fileId) && isAllowedExtension(ext);
}