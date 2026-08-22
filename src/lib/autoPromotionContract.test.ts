import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260822194500_auto_promotion.sql',
);
const migration = readFileSync(migrationPath, 'utf8');

describe('auto promotion to trusted user migration', () => {
  it('creates check_auto_promotion trigger function', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.check_auto_promotion()');
    expect(migration).toContain('RETURNS trigger');
    expect(migration).toContain('SECURITY DEFINER');
  });

  it('checks only on INSERT or UPDATE when status becomes approved', () => {
    expect(migration).toContain("IF (TG_OP = 'INSERT' AND NEW.status = 'approved') OR");
    expect(migration).toContain("(TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status <> 'approved') THEN");
  });

  it('only attempts to promote if the user is currently a student', () => {
    expect(migration).toContain("SELECT role INTO uploader_role FROM public.profiles WHERE id = NEW.uploader_id FOR UPDATE;");
    expect(migration).toContain("IF uploader_role = 'student' THEN");
  });

  it('calculates strictly approved files for that user', () => {
    expect(migration).toContain("SELECT count(*) INTO approved_count");
    expect(migration).toContain("FROM public.files");
    expect(migration).toContain("WHERE uploader_id = NEW.uploader_id AND status = 'approved';");
  });

  it('promotes the user to trusted when they reach 20 approved files', () => {
    expect(migration).toContain("IF approved_count >= 20 THEN");
    expect(migration).toContain("UPDATE public.profiles SET role = 'trusted' WHERE id = NEW.uploader_id;");
  });

  it('attaches the trigger to the files table', () => {
    expect(migration).toContain('CREATE TRIGGER trg_auto_promote_student');
    expect(migration).toContain('AFTER INSERT OR UPDATE ON public.files');
    expect(migration).toContain('FOR EACH ROW');
    expect(migration).toContain('EXECUTE FUNCTION public.check_auto_promotion();');
  });
});
