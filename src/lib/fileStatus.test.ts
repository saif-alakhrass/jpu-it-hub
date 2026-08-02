import { describe, it, expect } from 'vitest';
import {
  canTransition,
  transitionFile,
  removeFromPending,
  updateInList,
} from './fileStatus';
import type { FileRow } from './types';

function makeFile(overrides: Partial<FileRow> = {}): FileRow {
  return {
    id: 'f1',
    subject_id: 's1',
    tab: 'summaries',
    title: 'ملخص الفصل الأول',
    storage_path: 'u1/file.pdf',
    file_url: 'https://example.com/file.pdf',
    file_type: 'pdf',
    file_size: 1024,
    uploader_id: 'u1',
    status: 'pending',
    created_at: '2025-01-01T00:00:00Z',
    batch_id: null,
    ...overrides,
  };
}

describe('file approval lifecycle', () => {
  it('allows transitioning a pending file to approved', () => {
    const file = makeFile({ status: 'pending' });
    expect(canTransition(file.status, 'approved')).toBe(true);
    const approved = transitionFile(file, 'approved');
    expect(approved.status).toBe('approved');
  });

  it('allows transitioning a pending file to rejected', () => {
    const file = makeFile({ status: 'pending' });
    expect(canTransition(file.status, 'rejected')).toBe(true);
    const rejected = transitionFile(file, 'rejected');
    expect(rejected.status).toBe('rejected');
    expect(rejected.storage_path).toBe(file.storage_path);
    expect(rejected.id).toBe(file.id);
  });

  it('keeps rejected files restorable instead of treating rejection as deletion', () => {
    const rejected = transitionFile(makeFile(), 'rejected');
    const restored = transitionFile(rejected, 'approved');

    expect(restored.status).toBe('approved');
    expect(restored.storage_path).toBe('u1/file.pdf');
  });

  it('does not allow a rejected file to return to pending', () => {
    expect(canTransition('rejected', 'pending')).toBe(false);
  });

  it('full lifecycle: pending -> approved -> rejected -> approved (restore)', () => {
    const file = makeFile({ status: 'pending' });

    const approved = transitionFile(file, 'approved');
    expect(approved.status).toBe('approved');

    const rejected = transitionFile(approved, 'rejected');
    expect(rejected.status).toBe('rejected');

    const restored = transitionFile(rejected, 'approved');
    expect(restored.status).toBe('approved');
  });

  it('preserves file identity and other fields through a transition', () => {
    const file = makeFile({ status: 'pending', title: 'ملاحظات' });
    const approved = transitionFile(file, 'approved');
    expect(approved.id).toBe(file.id);
    expect(approved.title).toBe('ملاحظات');
    expect(approved.tab).toBe('summaries');
  });
});

describe('list helpers after approval', () => {
  it('removes the approved file from the pending queue', () => {
    const pending = [makeFile({ id: 'a', status: 'pending' }), makeFile({ id: 'b', status: 'pending' })];
    const next = removeFromPending(pending, 'a');
    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe('b');
  });

  it('updates the file status in the full file list', () => {
    const all = [makeFile({ id: 'a', status: 'pending' }), makeFile({ id: 'b', status: 'approved' })];
    const next = updateInList(all, 'a', 'approved');
    expect(next.find((f) => f.id === 'a')?.status).toBe('approved');
    expect(next.find((f) => f.id === 'b')?.status).toBe('approved');
  });
});
