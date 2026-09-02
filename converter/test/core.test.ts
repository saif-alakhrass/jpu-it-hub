import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

describe('container resource contract', () => {
  const serverSource = readFileSync(resolve(process.cwd(), 'server.mjs'), 'utf8');
  const config = JSON.parse(readFileSync(resolve(process.cwd(), 'wrangler.jsonc'), 'utf8')) as {
    queues: { consumers: Array<{ max_batch_size: number; max_concurrency: number }> };
    containers: Array<{ max_instances: number }>;
  };

  it('caps declared and streamed input before conversion and output before buffering', () => {
    expect(serverSource).toContain("request.headers['content-length']");
    expect(serverSource.indexOf('declaredLength > MAX_INPUT_BYTES')).toBeLessThan(serverSource.indexOf("mkdtemp(join(tmpdir(), 'office-preview-'))"));
    expect(serverSource.indexOf('pdfStats.size > MAX_OUTPUT_BYTES')).toBeLessThan(serverSource.indexOf('const pdf = await readFile(pdfPath)'));
    expect(serverSource).toContain("pdf.subarray(0, 5).toString('ascii') !== '%PDF-'");
  });

  it('always removes temporary workspaces and waits for timed-out LibreOffice to exit', () => {
    expect(serverSource).toContain("await rm(workspace, { recursive: true, force: true })");
    expect(serverSource).toContain("child.kill('SIGKILL')");
    expect(serverSource).toContain("child.once('exit'");
  });

  it('limits both queue and container concurrency to two single-file jobs', () => {
    expect(config.queues.consumers[0]).toMatchObject({ max_batch_size: 1, max_concurrency: 2 });
    expect(config.containers[0]?.max_instances).toBe(2);
  });
});
