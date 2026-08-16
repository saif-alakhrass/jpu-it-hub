import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bucketStub, issuedQuery, queryCount, queueResponses, resetSupabaseStub, supabaseStub } from '@/test/supabaseStub';
import { ServiceError } from '@/lib/serviceError';
import { PAGE_SIZE } from '@/lib/constants';
import {
  deleteBatch,
  deleteFile,
  fetchAdminFilesPaged,
  fetchAdminStats,
  fetchBatchesForSubject,
  fetchFilesForBatch,
  fetchFilesForSubject,
  fetchPendingFilesPaged,
  fetchRejectedFilesPaged,
  groupManagedFiles,
  moderatePendingBatch,
  removeStorageObjects,
  setFileStatus,
  updateManagedBatch,
  updateManagedFile,
} from './files';

vi.mock('@/lib/supabase', () => ({ supabase: supabaseStub, isSupabaseConfigured: true }));

beforeEach(() => {
  resetSupabaseStub();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('fetchFilesForSubject', () => {
  it('filters by subject and optionally by tab', async () => {
    queueResponses({ data: [{ id: 'f1' }], error: null }, { data: [], error: null });

    await expect(fetchFilesForSubject('s1')).resolves.toEqual([{ id: 'f1' }]);
    expect(issuedQuery(0).calls.filter((call) => call.method === 'eq')).toHaveLength(1);

    await fetchFilesForSubject('s1', 'exams');
    expect(issuedQuery(1).calls.filter((call) => call.method === 'eq').map((call) => call.args)).toEqual([
      ['subject_id', 's1'],
      ['tab', 'exams'],
    ]);
  });

  it('fails loudly when the query errors', async () => {
    queueResponses({ data: null, error: { message: 'denied' } });

    await expect(fetchFilesForSubject('s1')).rejects.toBeInstanceOf(ServiceError);
  });
});

describe('fetchBatchesForSubject', () => {
  it('reads batches for the subject and tab', async () => {
    queueResponses({ data: [{ id: 'b1' }], error: null });

    await expect(fetchBatchesForSubject('s1', 'slides')).resolves.toEqual([{ id: 'b1' }]);
    expect(issuedQuery(0).table).toBe('file_batches');
  });

  it('fails loudly when the query errors', async () => {
    queueResponses({ data: null, error: { message: 'denied' } });

    await expect(fetchBatchesForSubject('s1')).rejects.toBeInstanceOf(ServiceError);
  });
});

describe('moderation queues', () => {
  it('pages pending files', async () => {
    queueResponses({ data: [{ id: 'f1' }], error: null, count: PAGE_SIZE + 5 });

    await expect(fetchPendingFilesPaged(2)).resolves.toEqual({
      items: [{ id: 'f1' }],
      total: PAGE_SIZE + 5,
      page: 2,
      totalPages: 2,
    });
    const query = issuedQuery(0);
    expect(query.argsFor('eq')).toEqual(['status', 'pending']);
    expect(query.argsFor('range')).toEqual([PAGE_SIZE * 2, PAGE_SIZE * 3 - 1]);
  });

  it('pages rejected files', async () => {
    queueResponses({ data: null, error: null, count: null });

    await expect(fetchRejectedFilesPaged(0)).resolves.toEqual({ items: [], total: 0, page: 0, totalPages: 1 });
    expect(issuedQuery(0).argsFor('eq')).toEqual(['status', 'rejected']);
  });

  it('fails loudly when a queue query errors', async () => {
    queueResponses({ data: null, error: { message: 'denied' } }, { data: null, error: { message: 'denied' } });

    await expect(fetchPendingFilesPaged(0)).rejects.toBeInstanceOf(ServiceError);
    await expect(fetchRejectedFilesPaged(0)).rejects.toBeInstanceOf(ServiceError);
  });
});

describe('setFileStatus', () => {
  it('stores a trimmed reason when rejecting', async () => {
    queueResponses({ data: null, error: null });

    await expect(setFileStatus('f1', 'rejected', '  غير واضح  ')).resolves.toBe(true);
    const [update] = issuedQuery(0).argsFor('update') as [{ status: string; rejection_reason: string | null; moderated_at: string }];
    expect(update.status).toBe('rejected');
    expect(update.rejection_reason).toBe('غير واضح');
    expect(Number.isNaN(Date.parse(update.moderated_at))).toBe(false);
  });

  it('clears the reason when approving', async () => {
    queueResponses({ data: null, error: null }, { data: null, error: null });

    await setFileStatus('f1', 'approved', 'ignored');
    expect((issuedQuery(0).argsFor('update') as [{ rejection_reason: unknown }])[0].rejection_reason).toBeNull();

    await setFileStatus('f1', 'rejected');
    expect((issuedQuery(1).argsFor('update') as [{ rejection_reason: unknown }])[0].rejection_reason).toBeNull();
  });

  it('reports a failed update', async () => {
    queueResponses({ data: null, error: { message: 'denied' } });

    await expect(setFileStatus('f1', 'approved')).resolves.toBe(false);
  });
});

describe('fetchAdminFilesPaged', () => {
  it('filters by status only when one is given', async () => {
    queueResponses({ data: [], error: null, count: 0 }, { data: [], error: null, count: 0 });

    await fetchAdminFilesPaged(0);
    expect(issuedQuery(0).called('eq')).toBe(false);

    await fetchAdminFilesPaged(1, 'approved');
    expect(issuedQuery(1).argsFor('eq')).toEqual(['status', 'approved']);
  });

  it('fails loudly when the query errors', async () => {
    queueResponses({ data: null, error: { message: 'denied' } });

    await expect(fetchAdminFilesPaged(0)).rejects.toBeInstanceOf(ServiceError);
  });
});

describe('fetchFilesForBatch', () => {
  it('reads the files of a batch', async () => {
    queueResponses({ data: [{ id: 'f1' }], error: null });

    await expect(fetchFilesForBatch('b1')).resolves.toEqual([{ id: 'f1' }]);
    expect(issuedQuery(0).argsFor('eq')).toEqual(['batch_id', 'b1']);
  });

  it('fails loudly when the query errors', async () => {
    queueResponses({ data: null, error: { message: 'denied' } });

    await expect(fetchFilesForBatch('b1')).rejects.toBeInstanceOf(ServiceError);
  });
});

describe('updateManagedFile', () => {
  it('detaches the file from its batch when asked', async () => {
    queueResponses({ data: null, error: null });

    await expect(updateManagedFile('f1', { title: 'ملف', subject_id: 's1', tab: 'exams', detachFromBatch: true })).resolves.toBe(true);
    expect(issuedQuery(0).argsFor('update')).toEqual([
      { title: 'ملف', subject_id: 's1', tab: 'exams', batch_id: null, box_name: null },
    ]);
  });

  it('keeps the batch membership by default', async () => {
    queueResponses({ data: null, error: { message: 'denied' } });

    await expect(updateManagedFile('f1', { title: 'ملف', subject_id: 's1', tab: 'exams' })).resolves.toBe(false);
    expect(issuedQuery(0).argsFor('update')).toEqual([{ title: 'ملف', subject_id: 's1', tab: 'exams' }]);
  });
});

describe('admin RPCs', () => {
  it('updates a batch through the admin RPC', async () => {
    await expect(updateManagedBatch('b1', { title: 'دفعة', subject_id: 's1', tab: 'slides' })).resolves.toBe(true);
    expect(supabaseStub.rpc).toHaveBeenCalledWith('admin_update_file_batch', {
      p_batch_id: 'b1',
      p_title: 'دفعة',
      p_subject_id: 's1',
      p_tab: 'slides',
    });
  });

  it('groups files under a trimmed title', async () => {
    await expect(groupManagedFiles(['f1', 'f2'], '  مجموعة  ')).resolves.toBe(true);
    expect(supabaseStub.rpc).toHaveBeenCalledWith('admin_group_files', { p_file_ids: ['f1', 'f2'], p_title: 'مجموعة' });
  });

  it('moderates a pending batch, trimming the rejection reason', async () => {
    await moderatePendingBatch('b1', 'rejected', '  مكرر  ');
    expect(supabaseStub.rpc).toHaveBeenCalledWith('admin_moderate_pending_batch', {
      p_batch_id: 'b1',
      p_status: 'rejected',
      p_rejection_reason: 'مكرر',
    });

    await moderatePendingBatch('b1', 'approved');
    expect(supabaseStub.rpc).toHaveBeenLastCalledWith('admin_moderate_pending_batch', {
      p_batch_id: 'b1',
      p_status: 'approved',
      p_rejection_reason: null,
    });
  });

  it('reports a failed RPC', async () => {
    vi.mocked(supabaseStub.rpc).mockResolvedValue({ data: null, error: { message: 'not admin' } });

    await expect(groupManagedFiles(['f1'], 'مجموعة')).resolves.toBe(false);
  });
});

describe('deletions', () => {
  it('deletes a file row', async () => {
    queueResponses({ data: null, error: null });

    await expect(deleteFile('f1')).resolves.toBe(true);
    expect(issuedQuery(0).called('delete')).toBe(true);
  });

  it('deletes a batch row', async () => {
    queueResponses({ data: null, error: { message: 'denied' } });

    await expect(deleteBatch('b1')).resolves.toBe(false);
    expect(issuedQuery(0).table).toBe('file_batches');
  });

  it('removes storage objects, skipping empty lists', async () => {
    bucketStub.remove.mockResolvedValue({ data: null, error: null });

    await expect(removeStorageObjects([])).resolves.toBe(true);
    expect(bucketStub.remove).not.toHaveBeenCalled();

    await expect(removeStorageObjects(['a.pdf'])).resolves.toBe(true);
    expect(bucketStub.remove).toHaveBeenCalledWith(['a.pdf']);

    bucketStub.remove.mockResolvedValue({ data: null, error: { message: 'storage down' } });
    await expect(removeStorageObjects(['a.pdf'])).resolves.toBe(false);
  });
});

describe('fetchAdminStats', () => {
  it('derives the approved count from the other statuses', async () => {
    queueResponses(
      { data: null, error: null, count: 100 },
      { data: null, error: null, count: 7 },
      { data: null, error: null, count: 3 },
      { data: null, error: null, count: 40 },
      { data: null, error: null, count: 5 },
      { data: null, error: null, count: 2 },
      { data: null, error: null, count: 12 },
      { data: null, error: null, count: 6 },
    );

    await expect(fetchAdminStats()).resolves.toEqual({
      totalFiles: 100,
      approvedFiles: 90,
      pendingFiles: 7,
      rejectedFiles: 3,
      totalUsers: 40,
      trustedUsers: 5,
      admins: 2,
      totalSubjects: 12,
      totalBatches: 6,
    });
    expect(queryCount()).toBe(8);
  });

  it('treats missing counts as zero', async () => {
    await expect(fetchAdminStats()).resolves.toMatchObject({ totalFiles: 0, approvedFiles: 0, totalUsers: 0 });
  });

  it('fails loudly when any of the counting queries errors', async () => {
    queueResponses(
      { data: null, error: null, count: 1 },
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 0 },
      { data: null, error: { message: 'denied' } },
    );

    await expect(fetchAdminStats()).rejects.toBeInstanceOf(ServiceError);
  });
});
