import { describe, expect, it } from 'vitest';
import { buildPreviewKey, hasPdfSignature, isPermanentConversionError, isValidPreviewJob, safeErrorCode } from '../src/core';

const job = {
  file_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  source_hash: 'a'.repeat(64),
  converter_version: 'v1',
};

describe('Office conversion job contract', () => {
  it('validates immutable job identity', () => {
    expect(isValidPreviewJob(job)).toBe(true);
    expect(isValidPreviewJob({ ...job, file_id: '../../etc/passwd' })).toBe(false);
    expect(isValidPreviewJob({ ...job, source_hash: 'bad' })).toBe(false);
    expect(isValidPreviewJob({ ...job, converter_version: '../v1' })).toBe(false);
  });

  it('builds an isolated deterministic PDF object key', () => {
    expect(buildPreviewKey(job)).toBe(`previews/${job.file_id}/${job.source_hash}-v1.pdf`);
  });

  it('checks the complete PDF signature', () => {
    expect(hasPdfSignature(new TextEncoder().encode('%PDF-1.7'))).toBe(true);
    expect(hasPdfSignature(new TextEncoder().encode('%PDF'))).toBe(false);
    expect(hasPdfSignature(new TextEncoder().encode('PK...'))).toBe(false);
  });

  it('separates permanent document failures from retryable infrastructure failures', () => {
    expect(isPermanentConversionError('invalid_pdf_output')).toBe(true);
    expect(isPermanentConversionError('source_signature_mismatch')).toBe(true);
    expect(isPermanentConversionError('database_unavailable')).toBe(false);
    expect(safeErrorCode('Timeout: upstream failed!')).toBe('timeout__upstream_failed_');
  });
});
