import { supabase } from '@/lib/supabase';
import type { Bookmark, BookmarkWithFile, FileRow } from '@/lib/types';

export async function isBookmarked(resourceId: string): Promise<boolean> {
  const { data } = await supabase
    .from('bookmarks')
    .select('id')
    .eq('resource_id', resourceId)
    .maybeSingle();
  return !!data;
}

export async function getBookmarkedIds(resourceIds: string[]): Promise<Set<string>> {
  if (resourceIds.length === 0) return new Set();
  const { data } = await supabase
    .from('bookmarks')
    .select('resource_id')
    .in('resource_id', resourceIds);
  return new Set((data ?? []).map((b) => b.resource_id));
}

export async function addBookmark(
  resourceId: string,
  folderName: string,
  note?: string,
): Promise<Bookmark | null> {
  const { data, error } = await supabase
    .from('bookmarks')
    .insert({
      resource_id: resourceId,
      folder_name: folderName,
      note: note?.trim() || null,
    })
    .select()
    .maybeSingle();
  if (error) return null;
  return data as Bookmark | null;
}

export async function removeBookmark(resourceId: string): Promise<boolean> {
  const { error } = await supabase
    .from('bookmarks')
    .delete()
    .eq('resource_id', resourceId);
  return !error;
}

export async function removeBookmarkById(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('bookmarks')
    .delete()
    .eq('id', id);
  return !error;
}

export async function updateBookmark(
  id: string,
  updates: { folder_name?: string; note?: string | null },
): Promise<boolean> {
  const { error } = await supabase
    .from('bookmarks')
    .update(updates)
    .eq('id', id);
  return !error;
}

export async function getUserBookmarks(): Promise<BookmarkWithFile[]> {
  const { data, error } = await supabase
    .from('bookmarks')
    .select(`
      id, user_id, resource_id, folder_name, note, created_at,
      file:files(
        id, subject_id, tab, title, storage_path, file_url, file_type,
        uploader_id, status, created_at,
        subject:subjects!files_subject_id_fkey(id, name, code, description, major, departments, created_by, created_at)
      )
    `)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data.map((b) => {
    const fileArr = b.file as unknown as FileRow[] | FileRow | null | undefined;
    const file = Array.isArray(fileArr) ? (fileArr[0] ?? null) : (fileArr ?? null);
    return { ...b, file } as BookmarkWithFile;
  });
}

export async function getUserFolders(): Promise<string[]> {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('folder_name')
    .order('folder_name');

  if (error || !data) return [];
  return [...new Set(data.map((b) => b.folder_name))];
}
