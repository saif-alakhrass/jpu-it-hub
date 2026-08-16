/**
 * Supabase interaction utilities
 */

import type { Env } from './env';
import type { FileRecord, Profile } from './types';

function supabaseHeaders(env: Env): Headers {
  return new Headers({
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  });
}

export async function fetchProfile(env: Env, userId: string): Promise<Profile | null> {
  const url = `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id,role`;
  const res = await fetch(url, { headers: supabaseHeaders(env) });
  if (!res.ok) return null;
  const data = await res.json() as Profile[];
  return data[0] ?? null;
}

export async function authenticateWithProfile(env: Env, token: string): Promise<Profile | null> {
  const [, payloadB64] = token.split('.');
  const payload = payloadB64 ? JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))) : null;
  if (!payload?.sub) return null;
  const url = `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${payload.sub}&select=id,role`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!res.ok) return null;
  const data = await res.json() as Profile[];
  return data[0] ?? null;
}

export async function fetchFileRecord(env: Env, fileId: string): Promise<FileRecord | null> {
  const url = `${env.SUPABASE_URL}/rest/v1/files?id=eq.${fileId}&select=id,title,subject_id,uploader_id,status,storage_path,object_key,storage_provider,file_type,file_size,mime_type,file_hash,batch_id`;
  const res = await fetch(url, { headers: supabaseHeaders(env) });
  if (!res.ok) return null;
  const data = await res.json() as FileRecord[];
  return data[0] ?? null;
}

export async function insertFileRecord(env: Env, record: Record<string, unknown>): Promise<FileRecord | null> {
  const url = `${env.SUPABASE_URL}/rest/v1/files?select=id,subject_id,uploader_id,status,storage_path,object_key,storage_provider,file_type,file_size,mime_type,file_hash,batch_id`;
  const res = await fetch(url, {
    method: 'POST',
    headers: supabaseHeaders(env),
    body: JSON.stringify(record),
  });
  if (!res.ok) return null;
  const data = await res.json() as FileRecord[];
  return data[0] ?? null;
}

export async function deleteFileRecord(env: Env, fileId: string): Promise<boolean> {
  const url = `${env.SUPABASE_URL}/rest/v1/files?id=eq.${fileId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: supabaseHeaders(env),
  });
  return res.ok;
}

export async function checkDuplicateHash(env: Env, userId: string, subjectId: string, fileHash: string): Promise<boolean> {
  const url = `${env.SUPABASE_URL}/rest/v1/files?file_hash=eq.${fileHash}&subject_id=eq.${subjectId}&select=id`;
  const res = await fetch(url, { headers: supabaseHeaders(env) });
  if (!res.ok) return false;
  const data = await res.json() as { id: string }[];
  return data.length > 0;
}

export async function insertCleanupRecord(env: Env, objectKey: string, reason: string, userId?: string): Promise<void> {
  const url = `${env.SUPABASE_URL}/rest/v1/r2_cleanup_queue`;
  const body: Record<string, unknown> = { 
    object_key: objectKey, 
    reason, 
    status: 'pending' 
  };
  if (userId) {
    body.user_id = userId;
  }
  await fetch(url, {
    method: 'POST',
    headers: supabaseHeaders(env),
    body: JSON.stringify(body),
  }).catch(() => {});
}