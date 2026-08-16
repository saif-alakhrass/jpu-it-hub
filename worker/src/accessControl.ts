/**
 * Access control and rate limiting utilities
 */

import type { FileRecord, Profile } from './types';
import { getUploadLimit } from './types';

export function canAccessFile(file: FileRecord, userId: string, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  if (file.uploader_id === userId) return true;
  if (file.status === 'approved') return true;
  return false;
}

export function canDeleteFile(file: FileRecord, userId: string, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  // Only admin can delete (matching existing RLS policy)
  return false;
}

// ---------------------------------------------------------------------------
// Rate limiting (in-memory per-instance, backed by DB)
// ---------------------------------------------------------------------------

// Simple in-memory rate limit as a first line of defense.
// The database trigger is the authoritative enforcer.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

export function checkInMemoryRateLimit(userId: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now - entry.windowStart > windowMs) {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}