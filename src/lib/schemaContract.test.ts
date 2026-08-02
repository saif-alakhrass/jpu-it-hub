import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260803000000_complete_batch_and_storage_hardening.sql',
);
const migration = readFileSync(migrationPath, 'utf8');

describe('database hardening migration', () => {
  it('creates and protects file batches', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.file_batches');
    expect(migration).toContain('ALTER TABLE public.file_batches ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('CREATE POLICY "file_batches_select_visible"');
  });

  it('links files to batches and synchronizes aggregate state', () => {
    expect(migration).toContain('ADD CONSTRAINT files_batch_id_fkey');
    expect(migration).toContain('CREATE TRIGGER trg_sync_file_batch_after_file_change');
    expect(migration).toContain('recompute_file_batch_state');
  });

  it('serializes upload rate checks and protects the final administrator', () => {
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('The final administrator cannot be demoted');
  });

  it('prevents direct RPC execution of internal security-definer functions', () => {
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.recompute_file_batch_state(uuid) FROM PUBLIC, anon, authenticated',
    );
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.sync_file_batch_after_file_change() FROM PUBLIC, anon, authenticated',
    );
  });

  it('forces the storage bucket to remain private', () => {
    expect(migration).toContain("VALUES ('files', 'files', false)");
    expect(migration).toContain('ON CONFLICT (id) DO UPDATE SET public = false');
    expect(migration).toContain('files_bucket_read_approved_anon');
  });
});
