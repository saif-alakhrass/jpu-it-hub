import { beforeEach, describe, expect, it, vi } from 'vitest';
import { issuedQuery, queryCount, queueResponses, resetSupabaseStub, supabaseStub } from '@/test/supabaseStub';
import {
  addBookmark,
  getBookmarkedIds,
  getUserBookmarks,
  getUserFolders,
  isBookmarked,
  removeBookmark,
  removeBookmarkById,
  updateBookmark,
} from './bookmarks';

vi.mock('@/lib/supabase', () => ({ supabase: supabaseStub, isSupabaseConfigured: true }));

beforeEach(() => {
  resetSupabaseStub();
});

describe('isBookmarked', () => {
  it('is true only when a row exists for the resource', async () => {
    queueResponses({ data: { id: 'b1' }, error: null }, { data: null, error: null });

    await expect(isBookmarked('file-1')).resolves.toBe(true);
    await expect(isBookmarked('file-2')).resolves.toBe(false);
    expect(issuedQuery(0).argsFor('eq')).toEqual(['resource_id', 'file-1']);
  });
});

describe('getBookmarkedIds', () => {
  it('collects the bookmarked ids for the requested resources', async () => {
    queueResponses({ data: [{ resource_id: 'file-1' }, { resource_id: 'file-3' }], error: null });

    await expect(getBookmarkedIds(['file-1', 'file-2', 'file-3'])).resolves.toEqual(new Set(['file-1', 'file-3']));
    expect(issuedQuery(0).argsFor('in')).toEqual(['resource_id', ['file-1', 'file-2', 'file-3']]);
  });

  it('short-circuits for an empty resource list', async () => {
    await expect(getBookmarkedIds([])).resolves.toEqual(new Set());
    expect(queryCount()).toBe(0);
  });

  it('returns an empty set when the query yields no rows', async () => {
    queueResponses({ data: null, error: null });

    await expect(getBookmarkedIds(['file-1'])).resolves.toEqual(new Set());
  });
});

describe('addBookmark', () => {
  it('trims the note and stores the folder', async () => {
    queueResponses({ data: { id: 'b1' }, error: null });

    await expect(addBookmark('file-1', 'مفضلتي', '  مهم  ')).resolves.toEqual({ id: 'b1' });
    expect(issuedQuery(0).argsFor('insert')).toEqual([
      { resource_id: 'file-1', folder_name: 'مفضلتي', note: 'مهم' },
    ]);
  });

  it('stores a null note when it is blank or missing', async () => {
    queueResponses({ data: { id: 'b1' }, error: null }, { data: { id: 'b2' }, error: null });

    await addBookmark('file-1', 'مفضلتي', '   ');
    await addBookmark('file-2', 'مفضلتي');

    expect((issuedQuery(0).argsFor('insert') as [{ note: unknown }])[0].note).toBeNull();
    expect((issuedQuery(1).argsFor('insert') as [{ note: unknown }])[0].note).toBeNull();
  });

  it('returns null when the insert is rejected', async () => {
    queueResponses({ data: null, error: { message: 'duplicate key' } });

    await expect(addBookmark('file-1', 'مفضلتي')).resolves.toBeNull();
  });
});

describe('removing and updating bookmarks', () => {
  it('deletes by resource id and reports success', async () => {
    queueResponses({ data: null, error: null }, { data: null, error: { message: 'denied' } });

    await expect(removeBookmark('file-1')).resolves.toBe(true);
    await expect(removeBookmark('file-2')).resolves.toBe(false);
    expect(issuedQuery(0).called('delete')).toBe(true);
  });

  it('deletes by bookmark id', async () => {
    queueResponses({ data: null, error: null });

    await expect(removeBookmarkById('b1')).resolves.toBe(true);
    expect(issuedQuery(0).argsFor('eq')).toEqual(['id', 'b1']);
  });

  it('updates folder and note', async () => {
    queueResponses({ data: null, error: null }, { data: null, error: { message: 'denied' } });

    await expect(updateBookmark('b1', { folder_name: 'دراسة', note: null })).resolves.toBe(true);
    await expect(updateBookmark('b1', { note: 'x' })).resolves.toBe(false);
    expect(issuedQuery(0).argsFor('update')).toEqual([{ folder_name: 'دراسة', note: null }]);
  });
});

describe('getUserBookmarks', () => {
  it('flattens the embedded file relation whether it arrives as an array or object', async () => {
    queueResponses({
      data: [
        { id: 'b1', file: [{ id: 'f1' }] },
        { id: 'b2', file: { id: 'f2' } },
        { id: 'b3', file: null },
        { id: 'b4' },
      ],
      error: null,
    });

    const bookmarks = await getUserBookmarks();

    expect(bookmarks.map((b) => b.file?.id ?? null)).toEqual(['f1', 'f2', null, null]);
  });

  it('returns an empty list on error', async () => {
    queueResponses({ data: null, error: { message: 'denied' } });

    await expect(getUserBookmarks()).resolves.toEqual([]);
  });
});

describe('getUserFolders', () => {
  it('de-duplicates folder names', async () => {
    queueResponses({ data: [{ folder_name: 'دراسة' }, { folder_name: 'دراسة' }, { folder_name: 'امتحانات' }], error: null });

    await expect(getUserFolders()).resolves.toEqual(['دراسة', 'امتحانات']);
  });

  it('returns an empty list on error', async () => {
    queueResponses({ data: null, error: { message: 'denied' } });

    await expect(getUserFolders()).resolves.toEqual([]);
  });
});
