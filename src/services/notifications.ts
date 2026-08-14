import { supabase } from '@/lib/supabase';
import type { AppNotification } from '@/lib/types';
import { failService } from '@/lib/serviceError';

const NOTIFICATION_COLUMNS = 'id, recipient_id, type, title, message, subject_id, file_id, read_at, created_at, subject:subjects(id, name, code)';

/** A small on-demand inbox: no polling or realtime connection is needed. */
export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase.from('notifications').select(NOTIFICATION_COLUMNS).or(`recipient_id.eq.${userId},recipient_id.is.null`).order('created_at', { ascending: false }).limit(20);
  if (error) failService('fetch notifications', error);
  return (data ?? []) as unknown as AppNotification[];
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids).is('read_at', null);
  if (error) failService('mark notifications read', error);
}
