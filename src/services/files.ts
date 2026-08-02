import { supabase } from '@/lib/supabase';
import type { FileBatch, FileRow, FileStatus, FileTab } from '@/lib/types';
import { PAGE_SIZE } from '@/lib/constants';
import { failService } from '@/lib/serviceError';

const FILE_COLUMNS =
  'id, subject_id, tab, title, storage_path, file_url, file_type, file_size, uploader_id, status, created_at, batch_id, uploader:profiles!files_uploader_id_fkey(id, full_name, role), subject:subjects!files_subject_id_fkey(id, name, code)';

const BATCH_COLUMNS =
  'id, subject_id, tab, title, uploader_id, status, file_count, created_at';

export interface PaginatedFiles {
  items: FileRow[];
  total: number;
  page: number;
  totalPages: number;
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

export async function setFileStatus(id: string, status: FileStatus): Promise<boolean> {
  const { error } = await supabase.from('files').update({ status }).eq('id', id);
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
