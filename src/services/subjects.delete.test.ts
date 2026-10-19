import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  files: [] as Array<{ storage_path: string; object_key: string | null; storage_provider: string | null }>,
  events: [] as string[],
  remove: vi.fn(),
  getSession: vi.fn(),
  cleanupObjectsViaWorker: vi.fn(),
  isR2Configured: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    storage: { from: () => ({ remove: mocks.remove }) },
    from: (table: string) => {
      if (table === 'files') {
        return { select: () => ({ eq: async () => ({ data: mocks.files, error: null }) }) };
      }
      if (table === 'subjects') {
        return {
          delete: () => ({
            eq: async () => {
              mocks.events.push('delete-subject');
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  },
}));

vi.mock('@/lib/r2Client', () => ({
  cleanupObjectsViaWorker: mocks.cleanupObjectsViaWorker,
  isR2Configured: mocks.isR2Configured,
}));

import { deleteSubject } from './subjects';

describe('subject deletion storage consistency', () => {
  beforeEach(() => {
    mocks.files = [];
    mocks.events.length = 0;
    mocks.remove.mockReset().mockImplementation(async () => {
      mocks.events.push('delete-legacy-storage');
      return { error: null };
    });
    mocks.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'token' } } });
    mocks.isR2Configured.mockReset().mockReturnValue(true);
    mocks.cleanupObjectsViaWorker.mockReset().mockImplementation(async () => {
      mocks.events.push('delete-r2');
      return { success: true };
    });
  });

  it('commits the subject cascade before cleaning up R2 and legacy objects', async () => {
    mocks.files = [
      { storage_path: 'u/r2.pdf', object_key: 'u/r2.pdf', storage_provider: 'r2' },
      { storage_path: 'u/legacy.pdf', object_key: null, storage_provider: 'supabase' },
    ];

    await expect(deleteSubject('subject')).resolves.toEqual({ ok: true, storageCleanupFailed: false });
    expect(mocks.cleanupObjectsViaWorker).toHaveBeenCalledWith('token', ['u/r2.pdf']);
    expect(mocks.remove).toHaveBeenCalledWith(['u/legacy.pdf']);
    expect(mocks.events).toEqual(['delete-subject', 'delete-r2', 'delete-legacy-storage']);
  });

  it('reports a cleanup warning without rolling back an already committed cascade', async () => {
    mocks.files = [{ storage_path: 'u/r2.pdf', object_key: 'u/r2.pdf', storage_provider: 'r2' }];
    mocks.cleanupObjectsViaWorker.mockResolvedValue(null);

    await expect(deleteSubject('subject')).resolves.toEqual({ ok: true, storageCleanupFailed: true });
    expect(mocks.events).toContain('delete-subject');
  });

  it('reports when failed R2 deletion was safely queued for cleanup', async () => {
    mocks.files = [{ storage_path: 'u/r2.pdf', object_key: 'u/r2.pdf', storage_provider: 'r2' }];
    mocks.cleanupObjectsViaWorker.mockResolvedValue({ success: true, cleanup_queued: true });

    await expect(deleteSubject('subject')).resolves.toEqual({ ok: true, storageCleanupFailed: true });
    expect(mocks.events).toContain('delete-subject');
  });
});
