import { supabase } from '@/lib/supabase';
import type { Subject, Difficulty } from '@/lib/types';
import { PAGE_SIZE } from '@/lib/constants';
import { failService } from '@/lib/serviceError';

export interface PaginatedSubjects {
  items: Subject[];
  total: number;
  page: number;
  totalPages: number;
}

const SUBJECT_COLUMNS =
  'id, name, code, description, major, departments, created_by, created_at, difficulty, course_description';

export async function fetchSubjectsPaged(page: number, search?: string, major?: string): Promise<PaginatedSubjects> {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase.from('subjects').select(SUBJECT_COLUMNS, { count: 'exact' });

  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  }
  if (major) {
    query = query.contains('departments', [major]);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) failService('fetch subjects', error);

  const items = (data ?? []) as Subject[];
  const total = count ?? 0;
  return {
    items,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function fetchAllSubjects(): Promise<Subject[]> {
  const { data, error } = await supabase
    .from('subjects')
    .select(SUBJECT_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) failService('fetch all subjects', error);
  return (data ?? []) as Subject[];
}

export async function fetchSubject(id: string): Promise<Subject | null> {
  const { data, error } = await supabase
    .from('subjects')
    .select(SUBJECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) failService('fetch subject', error);
  return data as Subject | null;
}

export async function createSubject(input: {
  name: string;
  description?: string | null;
  major: string;
  departments?: string[];
  code?: string | null;
  difficulty?: Difficulty | null;
  course_description?: string | null;
}): Promise<Subject> {
  const { data, error } = await supabase
    .from('subjects')
    .insert({
      name: input.name.trim(),
      description: input.description || null,
      major: input.major,
      departments: input.departments ?? [input.major],
      code: input.code || null,
      difficulty: input.difficulty ?? null,
      course_description: input.course_description ?? null,
    })
    .select(SUBJECT_COLUMNS)
    .single();
  if (error) failService('create subject', error);
  return data as Subject;
}

export async function updateSubject(
  id: string,
  updates: Partial<Pick<Subject, 'name' | 'code' | 'description' | 'major' | 'departments' | 'difficulty' | 'course_description'>>,
): Promise<void> {
  const { error } = await supabase.from('subjects').update(updates).eq('id', id);
  if (error) failService('update subject', error);
}

export interface DeleteSubjectResult {
  /** The subject row is gone, but some stored files were left behind. */
  storageCleanupFailed: boolean;
}

export async function deleteSubject(id: string): Promise<DeleteSubjectResult> {
  const { data: files, error: filesError } = await supabase
    .from('files')
    .select('storage_path')
    .eq('subject_id', id);
  if (filesError) failService('fetch subject files for deletion', filesError);

  const { error } = await supabase.from('subjects').delete().eq('id', id);
  if (error) failService('delete subject', error);

  const paths = (files ?? []).map((file) => file.storage_path).filter(Boolean);
  if (paths.length === 0) return { storageCleanupFailed: false };

  const { error: storageError } = await supabase.storage.from('files').remove(paths);
  if (storageError) {
    console.error('Subject deleted but storage cleanup failed', storageError);
  }
  return { storageCleanupFailed: Boolean(storageError) };
}
