import { supabase } from '@/lib/supabase';
import type { Bookmark, BookmarkWithFile, FileRow } from '@/lib/types';
import { failService } from '@/lib/serviceError';

export async function isBookmarked(resourceId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('id')
    .eq('resource_id', resourceId)
    .maybeSingle();
  if (error) failService('check bookmark', error);
  return !!data;
}

export async function getBookmarkedIds(resourceIds: string[]): Promise<Set<string>> {
  if (resourceIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('bookmarks')
    .select('resource_id')
    .in('resource_id', resourceIds);
  if (error) failService('fetch bookmarked ids', error);
  return new Set((data ?? []).map((b) => b.resource_id));
}

export async function addBookmark(
  resourceId: string,
  folderName: string,
  note?: string,
): Promise<Bookmark> {
  const { data, error } = await supabase
    .from('bookmarks')
    .insert({
      resource_id: resourceId,
      folder_name: folderName,
      note: note?.trim() || null,
    })
    .select()
    .single();
  if (error) failService('add bookmark', error);
  return data as Bookmark;
}

export async function removeBookmark(resourceId: string): Promise<void> {
  const { error } = await supabase
    .from('bookmarks')
    .delete()
    .eq('resource_id', resourceId);
  if (error) failService('remove bookmark', error);
}

export async function removeBookmarkById(id: string): Promise<void> {
  const { error } = await supabase
    .from('bookmarks')
    .delete()
    .eq('id', id);
  if (error) failService('remove bookmark by id', error);
}

export async function updateBookmark(
  id: string,
  updates: { folder_name?: string; note?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('bookmarks')
    .update(updates)
    .eq('id', id);
  if (error) failService('update bookmark', error);
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

  if (error) failService('fetch user bookmarks', error);
  return (data ?? []).map((b) => {
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

  if (error) failService('fetch user folders', error);
  return [...new Set((data ?? []).map((b) => b.folder_name))];
}
