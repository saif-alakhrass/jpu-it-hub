import { supabase } from '@/lib/supabase';
import type { FileBatch, FileRow, FileStatus, FileTab } from '@/lib/types';
import { PAGE_SIZE } from '@/lib/constants';
import { failService } from '@/lib/serviceError';

const FILE_COLUMNS =
  'id, subject_id, tab, title, storage_path, file_url, file_type, file_size, uploader_id, status, created_at, batch_id, box_name, storage_provider, object_key, file_hash, mime_type, rejection_reason, moderated_at, moderated_by, uploader:profiles!files_uploader_id_fkey(id, full_name, role), subject:subjects!files_subject_id_fkey(id, name, code), batch:file_batches!files_batch_id_fkey(id, subject_id, tab, title, box_name, status, file_count)';

const BATCH_COLUMNS =
  'id, subject_id, tab, title, uploader_id, status, file_count, box_name, created_at';

export interface PaginatedFiles {
  items: FileRow[];
  total: number;
  page: number;
  totalPages: number;
}

export async function fetchUserApprovedCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('files')
    .select('*', { count: 'exact', head: true })
    .eq('uploader_id', userId)
    .eq('status', 'approved');
  
  if (error) return 0;
  return count ?? 0;
}

export async function fetchFilesForSubject(subjectId: string, tab?: FileTab): Promise<FileRow[]> {
  let query = supabase
    .from('files')
    .select(FILE_COLUMNS)
    .eq('subject_id', subjectId);
  if (tab) query = query.eq('tab', tab);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) failService('fetch files for subject', error);
  return (data ?? []) as unknown as FileRow[];
}

export async function fetchBatchesForSubject(subjectId: string, tab?: FileTab): Promise<FileBatch[]> {
  let query = supabase
    .from('file_batches')
    .select(BATCH_COLUMNS)
    .eq('subject_id', subjectId);
  if (tab) query = query.eq('tab', tab);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) failService('fetch file batches for subject', error);
  return (data ?? []) as unknown as FileBatch[];
}

export async function fetchPendingFilesPaged(page: number): Promise<PaginatedFiles> {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, error, count } = await supabase
    .from('files')
    .select(FILE_COLUMNS, { count: 'exact' })
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) failService('fetch pending files', error);
  return {
    items: (data ?? []) as unknown as FileRow[],
    total: count ?? 0,
    page,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
  };
}

export async function fetchRejectedFilesPaged(page: number): Promise<PaginatedFiles> {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, error, count } = await supabase
    .from('files')
    .select(FILE_COLUMNS, { count: 'exact' })
    .eq('status', 'rejected')
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) failService('fetch rejected files', error);
  return {
    items: (data ?? []) as unknown as FileRow[],
    total: count ?? 0,
    page,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
  };
}

export async function setFileStatus(id: string, status: FileStatus, rejectionReason?: string): Promise<boolean> {
  const update = { status, rejection_reason: status === 'rejected' ? rejectionReason?.trim() ?? null : null, moderated_at: new Date().toISOString() };
  const { error } = await supabase.from('files').update(update).eq('id', id);
  return !error;
}

export async function fetchAdminFilesPaged(page: number, status?: FileStatus): Promise<PaginatedFiles> {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  let query = supabase
    .from('files')
    .select(FILE_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  if (status) query = query.eq('status', status);
  const { data, error, count } = await query;
  if (error) failService('fetch admin files', error);
  return { items: (data ?? []) as unknown as FileRow[], total: count ?? 0, page, totalPages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)) };
}

export async function fetchFilesForBatch(batchId: string): Promise<FileRow[]> {
  const { data, error } = await supabase
    .from('files')
    .select(FILE_COLUMNS)
    .eq('batch_id', batchId)
    .order('created_at', { ascending: false });
  if (error) failService('fetch files for batch', error);
  return (data ?? []) as unknown as FileRow[];
}

export interface ManagedFileUpdate { title: string; subject_id: string; tab: FileTab; detachFromBatch?: boolean; }

export async function updateManagedFile(id: string, changes: ManagedFileUpdate): Promise<boolean> {
  const { detachFromBatch, ...details } = changes;
  const update = detachFromBatch ? { ...details, batch_id: null, box_name: null } : details;
  const { error } = await supabase.from('files').update(update).eq('id', id);
  return !error;
}

export async function updateManagedBatch(id: string, changes: Omit<ManagedFileUpdate, 'detachFromBatch'>): Promise<boolean> {
  const { error } = await supabase.rpc('admin_update_file_batch', {
    p_batch_id: id,
    p_title: changes.title,
    p_subject_id: changes.subject_id,
    p_tab: changes.tab,
  });
  return !error;
}

export async function groupManagedFiles(fileIds: string[], title: string): Promise<boolean> {
  const { error } = await supabase.rpc('admin_group_files', {
    p_file_ids: fileIds,
    p_title: title.trim(),
  });
  return !error;
}

export async function moderatePendingBatch(id: string, status: Extract<FileStatus, 'approved' | 'rejected'>, rejectionReason?: string): Promise<boolean> {
  const { error } = await supabase.rpc('admin_moderate_pending_batch', {
    p_batch_id: id,
    p_status: status,
    p_rejection_reason: rejectionReason?.trim() ?? null,
  });
  return !error;
}

export async function deleteFile(id: string): Promise<boolean> {
  const { error } = await supabase.from('files').delete().eq('id', id);
  return !error;
}

export async function removeStorageObjects(paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;
  const { error } = await supabase.storage.from('files').remove(paths);
  return !error;
}

export async function deleteBatch(batchId: string): Promise<boolean> {
  const { error } = await supabase.from('file_batches').delete().eq('id', batchId);
  return !error;
}

export interface AdminStats {
  totalFiles: number;
  approvedFiles: number;
  pendingFiles: number;
  rejectedFiles: number;
  totalUsers: number;
  trustedUsers: number;
  admins: number;
  totalSubjects: number;
  totalBatches: number;
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const [files, pending, rejected, users, trusted, admins, subjects, batches] = await Promise.all([
    supabase.from('files').select('*', { count: 'exact', head: true }),
    supabase.from('files').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('files').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'trusted'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin'),
    supabase.from('subjects').select('*', { count: 'exact', head: true }),
    supabase.from('file_batches').select('*', { count: 'exact', head: true }),
  ]);

  const failed = [files, pending, rejected, users, trusted, admins, subjects, batches]
    .find((result) => result.error);
  if (failed?.error) failService('fetch admin statistics', failed.error);

  return {
    totalFiles: files.count ?? 0,
    approvedFiles: (files.count ?? 0) - (pending.count ?? 0) - (rejected.count ?? 0),
    pendingFiles: pending.count ?? 0,
    rejectedFiles: rejected.count ?? 0,
    totalUsers: users.count ?? 0,
    trustedUsers: trusted.count ?? 0,
    admins: admins.count ?? 0,
    totalSubjects: subjects.count ?? 0,
    totalBatches: batches.count ?? 0,
  };
}
