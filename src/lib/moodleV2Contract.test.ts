import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261018090000_v2_moodle_academic_identity.sql'),
  'utf8',
);
const rateLimitMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261019100000_serialize_academic_login_limits.sql'),
  'utf8',
);

describe('Moodle V2 database contract', () => {
  it('keeps private identities outside the public schema', () => {
    expect(migration).toContain('private.academic_identities');
    expect(migration).toContain('REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated');
  });

  it('does not give browser roles write access to official academic data', () => {
    expect(migration).toContain('GRANT SELECT ON public.academic_courses');
    expect(migration).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE|ALL).*academic_courses/i);
    expect(migration).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE|ALL).*student_enrollments/i);
  });

  it('never mutates role fields during Moodle synchronization', () => {
    const syncBody = migration.split('CREATE OR REPLACE FUNCTION public.academic_complete_sync')[1] || '';
    expect(syncBody).not.toMatch(/SET\s+role\s*=/i);
    expect(syncBody).not.toMatch(/SET\s+is_super_admin\s*=/i);
  });

  it('does not auto-link administrator authority from an email match', () => {
    expect(migration).toContain("coalesce(profile.role, 'student') NOT IN ('admin')");
    expect(migration).toContain('coalesce(profile.is_super_admin, false) = false');
  });

  it('uses an idempotent enrollment upsert', () => {
    expect(migration).toContain('ON CONFLICT (user_id, course_id, term_key) DO UPDATE SET');
  });

  it('serializes concurrent attempts for the same academic login key', () => {
    expect(rateLimitMigration).toContain('pg_advisory_xact_lock');
    expect(rateLimitMigration).toContain('hashtextextended(p_key_hash, 0)');
    expect(rateLimitMigration).toContain('TO service_role');
  });
});
