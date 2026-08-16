import { describe, expect, it } from 'vitest';
import type { FileRow } from '@/lib/types';
import { shouldUseWorkerProxyDownload } from './useSignedFileAccess';

function makeFile(overrides: Partial<FileRow> = {}): FileRow {
  return {
    id: 'f1',
    subject_id: 's1',
    tab: 'summaries',
    title: 'test',
    storage_path: 'path',
    file_url: 'path',
    file_type: 'pdf',
    file_size: 100,
    uploader_id: 'u1',
    status: 'approved',
    created_at: new Date().toISOString(),
    batch_id: null,
    storage_provider: 'r2',
    object_key: 'u1/f1.pdf',
    file_hash: null,
    mime_type: 'application/pdf',
    rejection_reason: null,
    moderated_at: null,
    moderated_by: null,
    ...overrides,
  };
}

describe('shouldUseWorkerProxyDownload', () => {
  it('returns true for R2 file downloads', () => {
    expect(shouldUseWorkerProxyDownload(makeFile(), 'download')).toBe(true);
  });

  it('returns false for previews or non-R2 files', () => {
    expect(shouldUseWorkerProxyDownload(makeFile(), 'preview')).toBe(false);
    expect(shouldUseWorkerProxyDownload(makeFile({ storage_provider: 'supabase', object_key: null }), 'download')).toBe(false);
  });
});
