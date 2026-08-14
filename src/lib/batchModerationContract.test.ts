import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260814190000_secure_batch_moderation_and_management.sql'), 'utf8');

describe('batch moderation security migration', () => {
  it('forces non-admin batch uploads into review', () => {
    expect(migration).toContain("IF NEW.batch_id IS NOT NULL AND uploader_role <> 'admin' THEN");
    expect(migration).toContain("NEW.status := 'pending';");
    expect(migration).toContain('CREATE TRIGGER trg_set_file_batch_status');
  });

  it('keeps batch edits and grouping behind admin-only atomic functions', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.admin_update_pending_batch');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.admin_group_pending_files');
    expect(migration).toContain("IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator privileges required'; END IF;");
    expect(migration).toContain('FOR UPDATE');
  });
});
