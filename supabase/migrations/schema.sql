/*
# JPU-IT Hub — Consolidated Database Schema

## Overview
Single, clean, idempotent schema for the JPU-IT Hub academic resource platform
(Jerash University IT Faculty). Replaces the previous 24 fragmented migration
files (including duplicate .sql.sql / .sql.sql.sql copies) with one file that
spins up a brand-new Supabase instance seamlessly.

## Tables
  1. profiles        — user profile, linked to auth.users, with role + academic fields
  2. subjects        — courses, multi-department via departments[] array
  3. files           — uploaded resources, moderated (pending/approved/rejected)
  4. team_members    — About-page team cards
  5. bookmarks       — per-user saved-resource pointers

## Functions & Triggers
  - handle_new_user()   — auto-create a 'student' profile on signup (NO auto-admin)
  - set_file_status()   — approve uploads by admin/trusted users, pending otherwise
  - is_admin()          — helper for RLS policies

## Security (RLS)
  - profiles:   SELECT all authenticated; INSERT/UPDATE self or admin
  - subjects:   public SELECT; owner/admin write
  - files:      SELECT approved/own/admin; INSERT own; UPDATE/DELETE admin
  - team_members: public SELECT
  - bookmarks:  owner-scoped CRUD
  - storage bucket 'files': public read; own-object write; admin full

## Seed Data
  - 50 IT specialization subjects across علم الحاسوب & الأمن السيبراني
    (shared subjects carry both departments in the array)
  - 2 team members (founder + development partner)

## Notes
  - Fully idempotent: every CREATE uses IF NOT EXISTS, every policy is
    DROP IF EXISTS + CREATE, every seed uses ON CONFLICT / guarded INSERT.
  - Safe to re-run on an existing database without losing data.
  - Admin roles are NEVER assigned automatically. Assign manually:
        UPDATE profiles SET role = 'admin' WHERE id = '<user-uuid>';
*/

-- ===========================================================================
-- 1. PROFILES
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  role text NOT NULL DEFAULT 'student',
  academic_year text,
  department text,
  credit_hours int,
  bio text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- 2. SUBJECTS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text,
  description text,
  major text NOT NULL,
  departments text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_by uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  difficulty text,
  course_description text,
  CONSTRAINT subjects_name_key UNIQUE (name)
);
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- 3. FILE BATCHES
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.file_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  tab text NOT NULL CHECK (tab IN ('summaries','exams','images','slides')),
  title text NOT NULL,
  uploader_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  file_count int NOT NULL DEFAULT 0 CHECK (file_count >= 0),
  box_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.file_batches ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- 4. FILES
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  tab text NOT NULL CHECK (tab IN ('summaries','exams','images','slides')),
  title text NOT NULL,
  storage_path text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  batch_id uuid REFERENCES public.file_batches(id) ON DELETE SET NULL,
  box_name text,
  uploader_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_files_subject_id ON public.files(subject_id);
CREATE INDEX IF NOT EXISTS idx_files_status ON public.files(status);
CREATE INDEX IF NOT EXISTS idx_files_uploader ON public.files(uploader_id);
CREATE INDEX IF NOT EXISTS idx_files_batch_id ON public.files(batch_id);
CREATE INDEX IF NOT EXISTS idx_file_batches_subject_id ON public.file_batches(subject_id);
CREATE INDEX IF NOT EXISTS idx_file_batches_status ON public.file_batches(status);
CREATE INDEX IF NOT EXISTS idx_subjects_major ON public.subjects(major);

-- ===========================================================================
-- 4. TEAM MEMBERS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL,
  image_url text NOT NULL,
  bio text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT team_members_name_key UNIQUE (name)
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- 5. BOOKMARKS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  folder_name text NOT NULL DEFAULT 'عام',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookmarks_user_resource_unique UNIQUE (user_id, resource_id)
);
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON public.bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_folder ON public.bookmarks(user_id, folder_name);

-- ===========================================================================
-- 6. FUNCTIONS
-- ===========================================================================

-- is_admin(): returns true if the current user's profile role is 'admin'
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.prevent_role_update_nonadmin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Role changes require administrator privileges';
    END IF;
    IF OLD.role = 'admin' AND NEW.role <> 'admin'
       AND (SELECT count(*) FROM public.profiles WHERE role = 'admin') <= 1 THEN
      RAISE EXCEPTION 'The final administrator cannot be demoted';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- handle_new_user(): create a 'student' profile on signup. NEVER auto-admin.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'student'
  );
  RETURN NEW;
END;
$$;

-- set_file_status(): approve uploads by admin/trusted users; pending otherwise
CREATE OR REPLACE FUNCTION public.set_file_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uploader_role text;
  recent_count int;
  allowed_ext text[] := ARRAY['pdf','doc','docx','ppt','pptx','png','jpg','jpeg'];
  max_size_bytes bigint := 20971520;
BEGIN
  IF NEW.file_type IS NULL OR NOT (lower(NEW.file_type) = ANY(allowed_ext)) THEN
    RAISE EXCEPTION 'File type not allowed: %', NEW.file_type;
  END IF;

  IF NEW.file_size IS NOT NULL AND NEW.file_size > max_size_bytes THEN
    RAISE EXCEPTION 'File too large: maximum 20 MB';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.uploader_id::text));
  SELECT count(*) INTO recent_count
  FROM public.files
  WHERE uploader_id = NEW.uploader_id
    AND created_at > now() - interval '10 minutes';

  IF recent_count >= 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum 5 uploads per 10 minutes';
  END IF;

  SELECT role INTO uploader_role FROM public.profiles WHERE id = NEW.uploader_id;
  IF uploader_role IN ('admin','trusted') THEN
    NEW.status := 'approved';
  ELSE
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_file_batch_state(target_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_count integer;
  approved_count integer;
  rejected_count integer;
BEGIN
  IF target_batch_id IS NULL THEN RETURN; END IF;

  SELECT count(*)::integer,
         count(*) FILTER (WHERE status = 'approved')::integer,
         count(*) FILTER (WHERE status = 'rejected')::integer
  INTO total_count, approved_count, rejected_count
  FROM public.files
  WHERE batch_id = target_batch_id;

  IF total_count = 0 THEN
    DELETE FROM public.file_batches WHERE id = target_batch_id;
  ELSE
    UPDATE public.file_batches
    SET file_count = total_count,
        status = CASE
          WHEN approved_count = total_count THEN 'approved'
          WHEN rejected_count = total_count THEN 'rejected'
          ELSE 'pending'
        END
    WHERE id = target_batch_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_file_batch_after_file_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_file_batch_state(OLD.batch_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.batch_id IS DISTINCT FROM NEW.batch_id THEN
    PERFORM public.recompute_file_batch_state(OLD.batch_id);
  END IF;
  PERFORM public.recompute_file_batch_state(NEW.batch_id);
  RETURN NEW;
END;
$$;

-- ===========================================================================
-- 7. TRIGGERS
-- ===========================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS trg_consolidated_protect_role ON public.profiles;
CREATE TRIGGER trg_consolidated_protect_role
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_update_nonadmin();

DROP TRIGGER IF EXISTS trg_set_file_status ON public.files;
CREATE TRIGGER trg_set_file_status
  BEFORE INSERT ON public.files
  FOR EACH ROW
  EXECUTE FUNCTION public.set_file_status();

DROP TRIGGER IF EXISTS trg_sync_file_batch_after_file_change ON public.files;
CREATE TRIGGER trg_sync_file_batch_after_file_change
  AFTER INSERT OR DELETE OR UPDATE OF status, batch_id ON public.files
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_file_batch_after_file_change();

REVOKE ALL ON FUNCTION public.recompute_file_batch_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_file_batch_after_file_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_role_update_nonadmin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_file_status() FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 8. RLS POLICIES — PROFILES
-- ===========================================================================

DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
CREATE POLICY "profiles_select_all" ON public.profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_self_or_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- ===========================================================================
-- 9. RLS POLICIES — SUBJECTS
-- ===========================================================================

DROP POLICY IF EXISTS "subjects_select_public" ON public.subjects;
CREATE POLICY "subjects_select_public" ON public.subjects
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "subjects_insert_auth" ON public.subjects;
CREATE POLICY "subjects_insert_auth" ON public.subjects
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "subjects_update_owner_or_admin" ON public.subjects;
CREATE POLICY "subjects_update_owner_or_admin" ON public.subjects
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.is_admin())
  WITH CHECK (auth.uid() = created_by OR public.is_admin());

DROP POLICY IF EXISTS "subjects_delete_owner_or_admin" ON public.subjects;
CREATE POLICY "subjects_delete_owner_or_admin" ON public.subjects
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.is_admin());

-- ===========================================================================
-- 10. RLS POLICIES — FILES
-- ===========================================================================

DROP POLICY IF EXISTS "files_select_visible" ON public.files;
CREATE POLICY "files_select_visible" ON public.files
  FOR SELECT TO anon, authenticated
  USING (status = 'approved' OR uploader_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "files_insert_auth" ON public.files;
CREATE POLICY "files_insert_auth" ON public.files
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploader_id);

DROP POLICY IF EXISTS "files_update_admin" ON public.files;
CREATE POLICY "files_update_admin" ON public.files
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "files_delete_admin" ON public.files;
CREATE POLICY "files_delete_admin" ON public.files
  FOR DELETE TO authenticated USING (public.is_admin());

-- ===========================================================================
-- 11. RLS POLICIES — FILE BATCHES
-- ===========================================================================

DROP POLICY IF EXISTS "file_batches_select_visible" ON public.file_batches;
CREATE POLICY "file_batches_select_visible" ON public.file_batches
  FOR SELECT TO anon, authenticated
  USING (status = 'approved' OR uploader_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "file_batches_insert_own" ON public.file_batches;
CREATE POLICY "file_batches_insert_own" ON public.file_batches
  FOR INSERT TO authenticated WITH CHECK (uploader_id = auth.uid());

DROP POLICY IF EXISTS "file_batches_update_admin" ON public.file_batches;
CREATE POLICY "file_batches_update_admin" ON public.file_batches
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "file_batches_delete_owner_or_admin" ON public.file_batches;
CREATE POLICY "file_batches_delete_owner_or_admin" ON public.file_batches
  FOR DELETE TO authenticated USING (uploader_id = auth.uid() OR public.is_admin());

-- ===========================================================================
-- 12. RLS POLICIES — TEAM MEMBERS
-- ===========================================================================

DROP POLICY IF EXISTS "public_read_team_members" ON public.team_members;
CREATE POLICY "public_read_team_members" ON public.team_members
  FOR SELECT TO anon, authenticated USING (true);

-- ===========================================================================
-- 12. RLS POLICIES — BOOKMARKS
-- ===========================================================================

DROP POLICY IF EXISTS "select_own_bookmarks" ON public.bookmarks;
CREATE POLICY "select_own_bookmarks" ON public.bookmarks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_bookmarks" ON public.bookmarks;
CREATE POLICY "insert_own_bookmarks" ON public.bookmarks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_bookmarks" ON public.bookmarks;
CREATE POLICY "update_own_bookmarks" ON public.bookmarks
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_bookmarks" ON public.bookmarks;
CREATE POLICY "delete_own_bookmarks" ON public.bookmarks
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ===========================================================================
-- 13. STORAGE BUCKET + POLICIES
-- ===========================================================================

INSERT INTO storage.buckets (id, name, public) VALUES ('files', 'files', false)
  ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "files_bucket_read_public" ON storage.objects;
DROP POLICY IF EXISTS "files_bucket_read_restricted" ON storage.objects;
CREATE POLICY "files_bucket_read_restricted" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'files' AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.files AS file
        WHERE file.storage_path = name AND file.status = 'approved'
      )
    )
  );

DROP POLICY IF EXISTS "files_bucket_read_approved_anon" ON storage.objects;
CREATE POLICY "files_bucket_read_approved_anon" ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id = 'files' AND EXISTS (
      SELECT 1 FROM public.files AS file
      WHERE file.storage_path = name AND file.status = 'approved'
    )
  );

DROP POLICY IF EXISTS "files_bucket_insert_own" ON storage.objects;
CREATE POLICY "files_bucket_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'files' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "files_bucket_update_own_or_admin" ON storage.objects;
CREATE POLICY "files_bucket_update_own_or_admin" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'files' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));

DROP POLICY IF EXISTS "files_bucket_delete_own_or_admin" ON storage.objects;
CREATE POLICY "files_bucket_delete_own_or_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'files' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));

-- ===========================================================================
-- 14. SEED DATA — SUBJECTS (IT specialization courses only)
--     Shared subjects carry BOTH departments in the departments array.
--     major is the legacy column; departments[] is the source of truth.
-- ===========================================================================

INSERT INTO public.subjects (name, code, major, departments, created_by)
VALUES
  -- ---- Shared across both departments ----
  ('أساسيات البرمجة',              '1001130', 'علم الحاسوب', ARRAY['الأمن السيبراني','علم الحاسوب'], NULL),
  ('مقدمة في لغات البرمجة',        '1001108', 'علم الحاسوب', ARRAY['الأمن السيبراني','علم الحاسوب'], NULL),
  ('البرمجة الكينونية',            '1001131', 'علم الحاسوب', ARRAY['الأمن السيبراني','علم الحاسوب'], NULL),
  ('تراكيب البيانات وتنظيم الملفات','1001220', 'علم الحاسوب', ARRAY['الأمن السيبراني','علم الحاسوب'], NULL),
  ('مقدمة في برمجة الانترنت',      '1002130', 'علم الحاسوب', ARRAY['الأمن السيبراني','علم الحاسوب'], NULL),
  ('البرمجة المرئية',              '1001230', 'علم الحاسوب', ARRAY['الأمن السيبراني','علم الحاسوب'], NULL),
  ('شبكات الحاسوب',                '100251',  'علم الحاسوب', ARRAY['الأمن السيبراني','علم الحاسوب'], NULL),
  ('شبكات الحاسوب المتقدمة',       '1003351', 'علم الحاسوب', ARRAY['الأمن السيبراني','علم الحاسوب'], NULL),
  ('أمن المعلومات',                '1003361', 'علم الحاسوب', ARRAY['الأمن السيبراني','علم الحاسوب'], NULL),
  ('قواعد البيانات',               '1002140', 'علم الحاسوب', ARRAY['الأمن السيبراني','علم الحاسوب'], NULL),
  ('الذكاء الاصطناعي',             '1001310', 'علم الحاسوب', ARRAY['الأمن السيبراني','علم الحاسوب'], NULL),
  ('تحليل وتصميم الخوارزميات',     '1001223', 'علم الحاسوب', ARRAY['الأمن السيبراني','علم الحاسوب'], NULL),
  ('برمجة تطبيقات الانترنت',       '1001233', 'علم الحاسوب', ARRAY['الأمن السيبراني','علم الحاسوب'], NULL),
  ('رياضيات متقطعة',               '1001119', 'علم الحاسوب', ARRAY['الأمن السيبراني','علم الحاسوب'], NULL),
  ('الجبر الخطى باستخدام الحاسوب', '1001118', 'علم الحاسوب', ARRAY['الأمن السيبراني','علم الحاسوب'], NULL),
  ('مبادئ في الإحصاء',             '0303211', 'علم الحاسوب', ARRAY['الأمن السيبراني','علم الحاسوب'], NULL),
  ('نظم التشغيل',                  '1001410', 'علم الحاسوب', ARRAY['الأمن السيبراني','علم الحاسوب'], NULL),

  -- ---- Computer Science (علم الحاسوب) only ----
  ('البرمجة المتقدمة',             '1001328', 'علم الحاسوب', ARRAY['علم الحاسوب'], NULL),
  ('البرمجة الكينونية المتقدمة',   '1001329', 'علم الحاسوب', ARRAY['علم الحاسوب'], NULL),
  ('لغة برمجة مختارة',             '1001330', 'علم الحاسوب', ARRAY['علم الحاسوب'], NULL),
  ('الرسم بالحاسوب',               '1001460', 'علم الحاسوب', ARRAY['علم الحاسوب'], NULL),
  ('النظم الموزعة والسحابية',      '1001461', 'علم الحاسوب', ARRAY['علم الحاسوب'], NULL),
  ('وسائط متعددة',                 '1001314', 'علم الحاسوب', ARRAY['علم الحاسوب'], NULL),
  ('بحوث العمليات',                '1001320', 'علم الحاسوب', ARRAY['علم الحاسوب'], NULL),
  ('نظرية الاحتساب',               '1001224', 'علم الحاسوب', ARRAY['علم الحاسوب'], NULL),
  ('نظم استرجاع البيانات',         '1001243', 'علم الحاسوب', ARRAY['علم الحاسوب'], NULL),
  ('نماذج المحاكاة',               '1001471', 'علم الحاسوب', ARRAY['علم الحاسوب'], NULL),
  ('تصميم المنطق الرقمي',          '1001109', 'علم الحاسوب', ARRAY['علم الحاسوب'], NULL),
  ('تصميم وتنظيم الحاسوب',         '1001111', 'علم الحاسوب', ARRAY['علم الحاسوب'], NULL),
  ('قواعد البيانات المتقدمة',      '1001342', 'علم الحاسوب', ARRAY['علم الحاسوب'], NULL),
  ('معمارية الحاسوب',              '1001210', 'علم الحاسوب', ARRAY['علم الحاسوب'], NULL),
  ('تحليل وتصميم النظم',           '1001225', 'علم الحاسوب', ARRAY['علم الحاسوب'], NULL),
  ('هندسة البرمجيات',              '1001432', 'علم الحاسوب', ARRAY['علم الحاسوب'], NULL),
  ('تفاعل الانسان مع الحاسوب',     '1001393', 'علم الحاسوب', ARRAY['علم الحاسوب'], NULL),
  ('تحليل عددي',                   '0303321', 'علم الحاسوب', ARRAY['علم الحاسوب'], NULL),

  -- ---- Cybersecurity (الأمن السيبراني) only ----
  ('مبادئ الأمن السيبراني',        '1004161', 'الأمن السيبراني', ARRAY['الأمن السيبراني'], NULL),
  ('أمن البرمجيات',                '1004261', 'الأمن السيبراني', ARRAY['الأمن السيبراني'], NULL),
  ('أمن البنية التحتية باستخدام لينكس','1004262', 'الأمن السيبراني', ARRAY['الأمن السيبراني'], NULL),
  ('الشبكات اللاسلكية',            '1003350', 'الأمن السيبراني', ARRAY['الأمن السيبراني'], NULL),
  ('أمن الشبكات',                  '1003362', 'الأمن السيبراني', ARRAY['الأمن السيبراني'], NULL),
  ('بروتوكولات الاتصال الآمنة',    '1004363', 'الأمن السيبراني', ARRAY['الأمن السيبراني'], NULL),
  ('تحليلات البيانات',             '1004462', 'الأمن السيبراني', ARRAY['الأمن السيبراني'], NULL),
  ('أمن التجارة الإلكترونية',      '1003460', 'الأمن السيبراني', ARRAY['الأمن السيبراني'], NULL),
  ('برمجة متخصصة بالأمن السيبراني','1004463', 'الأمن السيبراني', ARRAY['الأمن السيبراني'], NULL),
  ('مشروع التخرج 1',               '1004482', 'الأمن السيبراني', ARRAY['الأمن السيبراني'], NULL),
  ('تدريب ميداني',                 '1004315', 'الأمن السيبراني', ARRAY['الأمن السيبراني'], NULL),
  ('مقدمة إلى الأدلة الجنائية الرقمية','1004472', 'الأمن السيبراني', ARRAY['الأمن السيبراني'], NULL),
  ('توثيق وتقييم الشبكات',         '1003461', 'الأمن السيبراني', ARRAY['الأمن السيبراني'], NULL),
  ('السلامة والمصادقة للبيانات',   '1004464', 'الأمن السيبراني', ARRAY['الأمن السيبراني'], NULL),
  ('مشروع التخرج 2',               '1004483', 'الأمن السيبراني', ARRAY['الأمن السيبراني'], NULL),
  ('تحليل عددي (1)',               '0303321', 'الأمن السيبراني', ARRAY['الأمن السيبراني'], NULL)
ON CONFLICT (name) DO NOTHING;

-- ===========================================================================
-- 15. SEED DATA — TEAM MEMBERS
-- ===========================================================================

INSERT INTO public.team_members (name, role, image_url, bio, sort_order)
VALUES
  ('سيف الأخرس (Saif Alakhrass)', 'مؤسس ومطور المنصة', '/my-photo.jpg',
   'مطور المنصة والمشرف على تطوير الأنظمة والخدمات الأكاديمية لطلاب الكلية.', 0),
  ('عبدالرحمن سريس', 'شريك التطوير والإشراف', '/abdullah-photo.jpg',
   'شريك في تطوير وإشراف منصة JPU-IT Hub ومتابعة الخدمات الأكاديمية والتقنية.', 1)
ON CONFLICT (name) DO NOTHING;
