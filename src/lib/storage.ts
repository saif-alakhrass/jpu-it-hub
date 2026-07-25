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
