/*
# JPU-IT Hub: profiles, subjects, files + moderation

1. Overview
   Full-stack academic resource hub for Jerash University IT Faculty.
   Roles: admin (owner), trusted (direct publish), student (uploads need approval).
   Files are organized into subjects and four resource tabs.

2. New Tables
   - `profiles`
       id          uuid PK -> auth.users.id (ON DELETE CASCADE)
       full_name   text
       role        text NOT NULL DEFAULT 'student'  -- 'admin' | 'trusted' | 'student'
       created_at  timestamptz DEFAULT now()
   - `subjects`
       id          uuid PK DEFAULT gen_random_uuid()
       name        text NOT NULL
       description text
       major       text NOT NULL
       created_by  uuid NOT NULL DEFAULT auth.uid() -> profiles.id
       created_at  timestamptz DEFAULT now()
   - `files`
       id            uuid PK DEFAULT gen_random_uuid()
       subject_id    uuid NOT NULL -> subjects.id ON DELETE CASCADE
       tab           text NOT NULL CHECK (tab IN ('summaries','exams','images','slides'))
       title         text NOT NULL
       storage_path  text NOT NULL
       file_url      text NOT NULL
       file_type     text
       uploader_id   uuid NOT NULL DEFAULT auth.uid() -> profiles.id
       status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected'))
       created_at    timestamptz DEFAULT now()

3. Automation
   - `handle_new_user()` trigger: on new auth.users row, insert a profile row.
     The FIRST user ever to sign up becomes 'admin'; everyone else 'student'.
   - `set_file_status()` trigger: on files INSERT, set status='approved' if the
     uploader's role is 'admin' or 'trusted', else 'pending'.

4. Indexes
   - files(subject_id), files(status), files(uploader_id), subjects(major).

5. Security (RLS)
   - profiles:  authenticated SELECT all; UPDATE only self OR admin.
   - subjects:  public SELECT; INSERT/UPDATE/DELETE for owners or admin.
   - files:     SELECT approved (public) OR own pending OR admin sees all;
                 INSERT by authenticated; UPDATE/DELETE admin only.
   - Storage bucket `files`: public read; authenticated insert/update/delete
                 of own objects; admin full access.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  role text NOT NULL DEFAULT 'student',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  major text NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  tab text NOT NULL CHECK (tab IN ('summaries','exams','images','slides')),
  title text NOT NULL,
  storage_path text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  uploader_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_files_subject_id ON files(subject_id);
CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
CREATE INDEX IF NOT EXISTS idx_files_uploader ON files(uploader_id);
CREATE INDEX IF NOT EXISTS idx_subjects_major ON subjects(major);

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE first_user boolean;
BEGIN
  SELECT (count(*) = 0) FROM profiles INTO first_user;
  INSERT INTO profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    CASE WHEN first_user THEN 'admin' ELSE 'student' END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION set_file_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE uploader_role text;
BEGIN
  SELECT role INTO uploader_role FROM profiles WHERE id = NEW.uploader_id;
  IF uploader_role IN ('admin','trusted') THEN
    NEW.status := 'approved';
  ELSE
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_file_status ON files;
CREATE TRIGGER trg_set_file_status
  BEFORE INSERT ON files
  FOR EACH ROW EXECUTE FUNCTION set_file_status();

DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_update_self_or_admin" ON profiles;
CREATE POLICY "profiles_update_self_or_admin" ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR is_admin()) WITH CHECK (auth.uid() = id OR is_admin());

DROP POLICY IF EXISTS "subjects_select_public" ON subjects;
CREATE POLICY "subjects_select_public" ON subjects FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "subjects_insert_auth" ON subjects;
CREATE POLICY "subjects_insert_auth" ON subjects FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "subjects_update_owner_or_admin" ON subjects;
CREATE POLICY "subjects_update_owner_or_admin" ON subjects FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR is_admin()) WITH CHECK (auth.uid() = created_by OR is_admin());

DROP POLICY IF EXISTS "subjects_delete_owner_or_admin" ON subjects;
CREATE POLICY "subjects_delete_owner_or_admin" ON subjects FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR is_admin());

DROP POLICY IF EXISTS "files_select_visible" ON files;
CREATE POLICY "files_select_visible" ON files FOR SELECT TO anon, authenticated
  USING (status = 'approved' OR uploader_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "files_insert_auth" ON files;
CREATE POLICY "files_insert_auth" ON files FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = uploader_id);

DROP POLICY IF EXISTS "files_update_admin" ON files;
CREATE POLICY "files_update_admin" ON files FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "files_delete_admin" ON files;
CREATE POLICY "files_delete_admin" ON files FOR DELETE TO authenticated
  USING (is_admin());

INSERT INTO storage.buckets (id, name, public) VALUES ('files', 'files', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "files_bucket_read_public" ON storage.objects;
CREATE POLICY "files_bucket_read_public" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'files');

DROP POLICY IF EXISTS "files_bucket_insert_own" ON storage.objects;
CREATE POLICY "files_bucket_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'files' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "files_bucket_update_own_or_admin" ON storage.objects;
CREATE POLICY "files_bucket_update_own_or_admin" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'files' AND ((storage.foldername(name))[1] = auth.uid()::text OR is_admin()));

DROP POLICY IF EXISTS "files_bucket_delete_own_or_admin" ON storage.objects;
CREATE POLICY "files_bucket_delete_own_or_admin" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'files' AND ((storage.foldername(name))[1] = auth.uid()::text OR is_admin()));
