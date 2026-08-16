/**
 * Orphan file tracking and cleanup utilities
 */

import type { Env } from './env';
import { insertCleanupRecord } from './supabase';
import { ORPHAN_FILE_TTL_MS } from './constants';

interface PendingUpload {
  objectKey: string;
  timestamp: number;
  userId: string;
}

const pendingUploads = new Map<string, PendingUpload>();

export function trackPendingUpload(objectKey: string, userId: string): void {
  pendingUploads.set(objectKey, {
    objectKey,
    timestamp: Date.now(),
    userId,
  });
}

export function removePendingUpload(objectKey: string): void {
  pendingUploads.delete(objectKey);
}

export async function cleanupOrphanFiles(env: Env): Promise<void> {
  const now = Date.now();
  const orphanedKeys: string[] = [];
  
  for (const [key, upload] of pendingUploads.entries()) {
    if (now - upload.timestamp > ORPHAN_FILE_TTL_MS) {
      orphanedKeys.push(key);
    }
  }
  
  for (const objectKey of orphanedKeys) {
    try {
      await env.FILES_BUCKET.delete(objectKey);
      await insertCleanupRecord(env, objectKey, 'orphan_upload_timeout');
      pendingUploads.delete(objectKey);
    } catch (error) {
      console.error('Failed to cleanup orphan file:', objectKey, error);
    }
  }
}

// Run cleanup periodically (every 5 minutes)
// Note: This runs per-instance, not globally
let cleanupInterval: number | null = null;

export function startCleanupScheduler(env: Env): void {
  if (cleanupInterval !== null) return; // Already started
  
  cleanupInterval = setInterval(() => {
    cleanupOrphanFiles(env).catch(error => {
      console.error('Error in orphan file cleanup:', error);
    });
  }, 5 * 60 * 1000) as unknown as number;
}

export function stopCleanupScheduler(): void {
  if (cleanupInterval !== null) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}