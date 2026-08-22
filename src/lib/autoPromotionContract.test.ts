import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260822220000_auto_promote_trusted_contributors.sql'),
  'utf8',
);

describe('automatic trusted promotion database contract', () => {
  it('does not count pending or rejected files', () => {
    expect(migration).toContain("status = 'approved'");
    expect(migration).not.toContain("status IN ('pending', 'rejected')");
  });

  it('counts duplicate hashes once', () => {
    expect(migration).toContain("count(DISTINCT coalesce(nullif(file_hash, ''), id::text))");
  });

  it('does not keep a client-editable counter for deleted files', () => {
    expect(migration).toContain('FROM public.files');
    expect(migration).not.toContain('ADD COLUMN approved_count');
  });

  it('promotes at 20 and leaves 19 unchanged', () => {
    expect(migration).toContain('approved_contribution_count(p_user_id) < 20');
    expect(migration).toContain("SET role = 'trusted'");
    expect(migration).toContain("role = 'student'");
  });

  it('runs only when a file newly becomes approved', () => {
    expect(migration).toContain("NEW.status = 'approved'");
    expect(migration).toContain("OLD.status IS DISTINCT FROM 'approved'");
    expect(migration).toContain('AFTER UPDATE OF status');
  });

  it('is idempotent and preserves trusted, admin, and super-admin roles', () => {
    expect(migration).toContain("current_role IS DISTINCT FROM 'student'");
    expect(migration).toContain('current_is_super_admin IS TRUE');
    expect(migration).toContain('AND is_super_admin = false');
  });

  it('serializes concurrent approvals for the same uploader', () => {
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('FOR UPDATE');
  });

  it('does not expose internal count or promotion functions to clients', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.approved_contribution_count(uuid) FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.promote_uploader_if_eligible(uuid) FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_my_contribution_progress() TO authenticated');
  });
});
