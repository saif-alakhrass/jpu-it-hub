import { supabase } from '@/lib/supabase';
import type { Subject, Difficulty } from '@/lib/types';
import { PAGE_SIZE } from '@/lib/constants';

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

  if (error) return { items: [], total: count ?? 0, page, totalPages: 0 };

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
  if (error) return [];
  return (data ?? []) as Subject[];
}

export async function fetchSubject(id: string): Promise<Subject | null> {
  const { data, error } = await supabase
    .from('subjects')
    .select(SUBJECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) return null;
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
}): Promise<Subject | null> {
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
    .maybeSingle();
  if (error) return null;
  return data as Subject | null;
}

export async function updateSubject(
  id: string,
  updates: Partial<Pick<Subject, 'name' | 'code' | 'description' | 'major' | 'departments' | 'difficulty' | 'course_description'>>,
): Promise<boolean> {
  const { error } = await supabase.from('subjects').update(updates).eq('id', id);
  return !error;
}

export async function deleteSubject(id: string): Promise<boolean> {
  const { error } = await supabase.from('subjects').delete().eq('id', id);
  return !error;
}
