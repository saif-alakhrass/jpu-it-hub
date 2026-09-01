import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260901010000_office_pdf_previews.sql'),
  'utf8',
);

describe('private Office preview database contract', () => {
  it('stores object identity and lifecycle state, never a signed URL', () => {
    expect(migration).toContain('preview_object_key text');
    expect(migration).toContain('preview_source_hash text');
    expect(migration).toContain("preview_status IN ('none', 'queued', 'processing', 'ready', 'failed')");
    expect(migration).not.toMatch(/preview_signed_url|signed_url/i);
  });

  it('serializes lazy requests and conversion claims', () => {
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('claim_office_preview_conversion');
    expect(migration).toContain("preview_status = 'processing'");
    expect(migration).toContain('preview_lease_until');
  });

  it('binds a ready derivative to its immutable source hash and converter version', () => {
    expect(migration).toContain('preview_source_hash = p_source_hash');
    expect(migration).toContain('preview_converter_version = p_converter_version');
    expect(migration).toContain('files_ready_preview_integrity_check');
  });

  it('keeps all state transitions server-only', () => {
    expect(migration).toContain("auth.role() IS DISTINCT FROM 'service_role'");
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.request_office_preview(uuid, text, text) FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.request_office_preview(uuid, text, text) TO service_role');
  });
});
