import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bucketStub, issuedQuery, queryCount, queueResponses, resetSupabaseStub, supabaseStub } from '@/test/supabaseStub';
import { ServiceError } from '@/lib/serviceError';
import { PAGE_SIZE } from '@/lib/constants';
import {
  createSubject,
  deleteSubject,
  fetchAllSubjects,
  fetchSubject,
  fetchSubjectsPaged,
  updateSubject,
} from './subjects';

vi.mock('@/lib/supabase', () => ({ supabase: supabaseStub, isSupabaseConfigured: true }));

beforeEach(() => {
  resetSupabaseStub();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('fetchSubjectsPaged', () => {
  it('requests the page range and derives the page count', async () => {
    queueResponses({ data: [{ id: 's1' }], error: null, count: PAGE_SIZE * 2 + 1 });

    const page = await fetchSubjectsPaged(1);

    expect(page).toEqual({ items: [{ id: 's1' }], total: PAGE_SIZE * 2 + 1, page: 1, totalPages: 3 });
    expect(issuedQuery(0).argsFor('range')).toEqual([PAGE_SIZE, PAGE_SIZE * 2 - 1]);
  });

  it('applies the search and major filters', async () => {
    queueResponses({ data: [], error: null, count: 0 });

    await fetchSubjectsPaged(0, 'شبكات', 'الأمن السيبراني');

    const query = issuedQuery(0);
    expect(query.argsFor('or')).toEqual(['name.ilike.%شبكات%,description.ilike.%شبكات%']);
    expect(query.argsFor('contains')).toEqual(['departments', ['الأمن السيبراني']]);
  });

  it('reports at least one page for an empty result', async () => {
    queueResponses({ data: null, error: null, count: null });

    await expect(fetchSubjectsPaged(0)).resolves.toEqual({ items: [], total: 0, page: 0, totalPages: 1 });
  });

  it('fails loudly when the query errors', async () => {
    queueResponses({ data: null, error: { message: 'denied' } });

    await expect(fetchSubjectsPaged(0)).rejects.toBeInstanceOf(ServiceError);
  });
});

describe('fetchAllSubjects', () => {
  it('returns every subject newest first', async () => {
    queueResponses({ data: [{ id: 's1' }], error: null });

    await expect(fetchAllSubjects()).resolves.toEqual([{ id: 's1' }]);
    expect(issuedQuery(0).argsFor('order')).toEqual(['created_at', { ascending: false }]);
  });

  it('fails loudly when the query errors', async () => {
    queueResponses({ data: null, error: { message: 'denied' } });

    await expect(fetchAllSubjects()).rejects.toBeInstanceOf(ServiceError);
  });
});

describe('fetchSubject', () => {
  it('returns the single subject', async () => {
    queueResponses({ data: { id: 's1' }, error: null });

    await expect(fetchSubject('s1')).resolves.toEqual({ id: 's1' });
    expect(issuedQuery(0).argsFor('eq')).toEqual(['id', 's1']);
  });

  it('fails loudly when the query errors', async () => {
    queueResponses({ data: null, error: { message: 'denied' } });

    await expect(fetchSubject('s1')).rejects.toBeInstanceOf(ServiceError);
  });
});

describe('createSubject', () => {
  it('trims the name, defaults departments to the major and nulls blank fields', async () => {
    queueResponses({ data: { id: 's1' }, error: null });

    await expect(createSubject({ name: '  قواعد البيانات  ', major: 'علم الحاسوب' })).resolves.toEqual({ id: 's1' });
    expect(issuedQuery(0).argsFor('insert')).toEqual([{
      name: 'قواعد البيانات',
      description: null,
      major: 'علم الحاسوب',
      departments: ['علم الحاسوب'],
      code: null,
      difficulty: null,
      course_description: null,
    }]);
  });

  it('keeps explicit departments and metadata', async () => {
    queueResponses({ data: { id: 's1' }, error: null });

    await createSubject({
      name: 'أمن الشبكات',
      major: 'الأمن السيبراني',
      departments: ['الأمن السيبراني', 'علم الحاسوب'],
      code: 'CS-401',
      description: 'وصف',
      difficulty: 'صعبة',
      course_description: 'تفاصيل',
    });

    expect(issuedQuery(0).argsFor('insert')).toEqual([{
      name: 'أمن الشبكات',
      description: 'وصف',
      major: 'الأمن السيبراني',
      departments: ['الأمن السيبراني', 'علم الحاسوب'],
      code: 'CS-401',
      difficulty: 'صعبة',
      course_description: 'تفاصيل',
    }]);
  });

  it('returns null when the insert is rejected', async () => {
    queueResponses({ data: null, error: { message: 'duplicate' } });

    await expect(createSubject({ name: 'مادة', major: 'علم الحاسوب' })).resolves.toBeNull();
  });
});

describe('updateSubject', () => {
  it('reports whether the update succeeded', async () => {
    queueResponses({ data: null, error: null }, { data: null, error: { message: 'denied' } });

    await expect(updateSubject('s1', { name: 'اسم جديد' })).resolves.toBe(true);
    await expect(updateSubject('s1', { name: 'اسم جديد' })).resolves.toBe(false);
  });
});

describe('deleteSubject', () => {
  it('deletes the subject then removes its storage objects', async () => {
    queueResponses(
      { data: [{ storage_path: 'a.pdf' }, { storage_path: null }], error: null },
      { data: null, error: null },
    );
    bucketStub.remove.mockResolvedValue({ data: null, error: null });

    await expect(deleteSubject('s1')).resolves.toEqual({ ok: true, storageCleanupFailed: false });
    expect(bucketStub.remove).toHaveBeenCalledWith(['a.pdf']);
  });

  it('flags a failed storage cleanup while still reporting the row deletion', async () => {
    queueResponses({ data: [{ storage_path: 'a.pdf' }], error: null }, { data: null, error: null });
    bucketStub.remove.mockResolvedValue({ data: null, error: { message: 'storage down' } });

    await expect(deleteSubject('s1')).resolves.toEqual({ ok: true, storageCleanupFailed: true });
  });

  it('skips storage cleanup when the subject has no files', async () => {
    queueResponses({ data: [], error: null }, { data: null, error: null });

    await expect(deleteSubject('s1')).resolves.toEqual({ ok: true, storageCleanupFailed: false });
    expect(bucketStub.remove).not.toHaveBeenCalled();
  });

  it('does not delete the subject when its files cannot be listed', async () => {
    queueResponses({ data: null, error: { message: 'denied' } });

    await expect(deleteSubject('s1')).resolves.toEqual({ ok: false, storageCleanupFailed: false });
    expect(queryCount()).toBe(1);
  });

  it('reports failure when the subject row cannot be deleted', async () => {
    queueResponses({ data: [{ storage_path: 'a.pdf' }], error: null }, { data: null, error: { message: 'denied' } });

    await expect(deleteSubject('s1')).resolves.toEqual({ ok: false, storageCleanupFailed: false });
    expect(bucketStub.remove).not.toHaveBeenCalled();
  });
});
