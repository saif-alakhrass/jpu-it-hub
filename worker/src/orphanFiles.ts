/**
 * Orphan file tracking and cleanup utilities (DB-based for durability)
 */

import type { Env } from './env';
import { ORPHAN_FILE_TTL_MS } from './constants';

/**
 * Track a pending upload in the database for durability
 * This uses the r2_cleanup_queue table to track pending uploads
 * that may become orphaned if the upload process is interrupted
 */
export async function trackPendingUpload(env: Env, objectKey: string, userId: string): Promise<void> {
  const url = `${env.SUPABASE_URL}/rest/v1/r2_cleanup_queue`;
  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      object_key: objectKey,
      reason: 'pending_upload',
      status: 'pending',
      user_id: userId,
      created_at: new Date().toISOString(),
    }),
  }).catch((error) => {
    console.error('Failed to track pending upload in database:', objectKey, error);
  });
}

/**
 * Remove a pending upload from tracking when successfully confirmed
 */
export async function removePendingUpload(env: Env, objectKey: string): Promise<void> {
  const url = `${env.SUPABASE_URL}/rest/v1/r2_cleanup_queue?object_key=eq.${encodeURIComponent(objectKey)}&reason=eq.pending_upload`;
  await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    },
  }).catch((error) => {
    console.error('Failed to remove pending upload from database:', objectKey, error);
  });
}

/**
 * Cleanup orphan files by checking the database for expired pending uploads
 * This is durable and survives worker restarts
 */
export async function cleanupOrphanFiles(env: Env): Promise<void> {
  const cutoffTime = new Date(Date.now() - ORPHAN_FILE_TTL_MS).toISOString();
  
  // Find expired pending uploads
  const url = `${env.SUPABASE_URL}/rest/v1/r2_cleanup_queue?reason=eq.pending_upload&status=eq.pending&created_at=lt.${encodeURIComponent(cutoffTime)}&select=object_key`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    
    if (!response.ok) {
      console.error('Failed to fetch orphan files for cleanup');
      return;
    }
    
    const orphanFiles = await response.json() as Array<{ object_key: string }>;
    
    for (const { object_key } of orphanFiles) {
      try {
        // Delete the R2 object
        await env.FILES_BUCKET.delete(object_key);
        
        // Delete the cleanup record since we've cleaned it up
        const deleteUrl = `${env.SUPABASE_URL}/rest/v1/r2_cleanup_queue?object_key=eq.${encodeURIComponent(object_key)}`;
        await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          },
        });
        
        console.log('Cleaned orphan file:', object_key);
      } catch (error) {
        console.error('Failed to cleanup orphan file:', object_key, error);
      }
    }
  } catch (error) {
    console.error('Error in orphan file cleanup:', error);
  }
}

// Run cleanup periodically (every 5 minutes)
// This is now DB-based and durable across worker restarts
let cleanupInterval: number | null = null;

export function startCleanupScheduler(env: Env): void {
  if (cleanupInterval !== null) return; // Already started
  
  cleanupInterval = setInterval(() => {
    cleanupOrphanFiles(env).catch(error => {
      console.error('Error in orphan file cleanup scheduler:', error);
    });
  }, 5 * 60 * 1000) as unknown as number;
  
  console.log('Orphan file cleanup scheduler started (DB-based, durable)');
}

export function stopCleanupScheduler(): void {
  if (cleanupInterval !== null) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('Orphan file cleanup scheduler stopped');
  }
}