import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESTRICTED_TABS, getVisibleTabs } from './types';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260803000000_complete_batch_and_storage_hardening.sql',
);
const migration = readFileSync(migrationPath, 'utf8');

const examsMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260822180000_restrict_exams_tab.sql',
);
const examsMigration = readFileSync(examsMigrationPath, 'utf8');

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

describe('exams tab restriction', () => {
  it('exams tab is in RESTRICTED_TABS', () => {
    expect(RESTRICTED_TABS.has('exams')).toBe(true);
  });

  it('non-restricted tabs are not in RESTRICTED_TABS', () => {
    expect(RESTRICTED_TABS.has('summaries')).toBe(false);
    expect(RESTRICTED_TABS.has('images')).toBe(false);
    expect(RESTRICTED_TABS.has('slides')).toBe(false);
  });

  it('getVisibleTabs excludes exams for students', () => {
    const tabs = getVisibleTabs('student');
    expect(tabs.some((t) => t.key === 'exams')).toBe(false);
    expect(tabs.some((t) => t.key === 'summaries')).toBe(true);
  });

  it('getVisibleTabs excludes exams for unauthenticated users (null role)', () => {
    const tabs = getVisibleTabs(null);
    expect(tabs.some((t) => t.key === 'exams')).toBe(false);
  });

  it('getVisibleTabs includes exams for trusted users', () => {
    const tabs = getVisibleTabs('trusted');
    expect(tabs.some((t) => t.key === 'exams')).toBe(true);
  });

  it('getVisibleTabs includes exams for admin users', () => {
    const tabs = getVisibleTabs('admin');
    expect(tabs.some((t) => t.key === 'exams')).toBe(true);
  });

  it('getVisibleTabs preserves all other tabs for every role', () => {
    for (const role of ['student', 'trusted', 'admin'] as const) {
      const tabs = getVisibleTabs(role);
      expect(tabs.some((t) => t.key === 'summaries')).toBe(true);
      expect(tabs.some((t) => t.key === 'images')).toBe(true);
      expect(tabs.some((t) => t.key === 'slides')).toBe(true);
    }
  });

  it('database migration creates is_trusted_or_admin helper', () => {
    expect(examsMigration).toContain('CREATE OR REPLACE FUNCTION public.is_trusted_or_admin()');
    expect(examsMigration).toContain("role IN ('trusted', 'admin')");
  });

  it('database migration restricts files SELECT policy for exams tab', () => {
    expect(examsMigration).toContain('DROP POLICY IF EXISTS "files_select_visible"');
    expect(examsMigration).toContain("tab <> 'exams'");
    expect(examsMigration).toContain('is_trusted_or_admin()');
  });

  it('database migration restricts file_batches SELECT policy for exams tab', () => {
    expect(examsMigration).toContain('DROP POLICY IF EXISTS "file_batches_select_visible"');
  });
});
