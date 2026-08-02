/* Complete the batch schema and make storage privacy explicit. */

CREATE TABLE IF NOT EXISTS public.file_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  tab text NOT NULL CHECK (tab IN ('summaries', 'exams', 'images', 'slides')),
  title text NOT NULL,
  uploader_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  file_count integer NOT NULL DEFAULT 0 CHECK (file_count >= 0),
  box_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.file_batches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS batch_id uuid,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS box_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'files_batch_id_fkey'
      AND conrelid = 'public.files'::regclass
  ) THEN
    ALTER TABLE public.files
      ADD CONSTRAINT files_batch_id_fkey
      FOREIGN KEY (batch_id) REFERENCES public.file_batches(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_file_batches_subject_id ON public.file_batches(subject_id);
CREATE INDEX IF NOT EXISTS idx_file_batches_status ON public.file_batches(status);
CREATE INDEX IF NOT EXISTS idx_file_batches_uploader_id ON public.file_batches(uploader_id);
CREATE INDEX IF NOT EXISTS idx_files_batch_id ON public.files(batch_id);

CREATE OR REPLACE FUNCTION public.set_file_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uploader_role text;
  recent_count integer;
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
  NEW.status := CASE WHEN uploader_role IN ('admin', 'trusted') THEN 'approved' ELSE 'pending' END;
  RETURN NEW;
END;
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
  FOR DELETE TO authenticated
  USING (uploader_id = auth.uid() OR public.is_admin());

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
  next_status text;
BEGIN
  IF target_batch_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE status = 'approved')::integer,
    count(*) FILTER (WHERE status = 'rejected')::integer
  INTO total_count, approved_count, rejected_count
  FROM public.files
  WHERE batch_id = target_batch_id;

  IF total_count = 0 THEN
    DELETE FROM public.file_batches WHERE id = target_batch_id;
    RETURN;
  END IF;

  next_status := CASE
    WHEN approved_count = total_count THEN 'approved'
    WHEN rejected_count = total_count THEN 'rejected'
    ELSE 'pending'
  END;

  UPDATE public.file_batches
  SET file_count = total_count, status = next_status
  WHERE id = target_batch_id;
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

DROP TRIGGER IF EXISTS trg_sync_file_batch_after_file_change ON public.files;
CREATE TRIGGER trg_sync_file_batch_after_file_change
  AFTER INSERT OR DELETE OR UPDATE OF status, batch_id ON public.files
  FOR EACH ROW EXECUTE FUNCTION public.sync_file_batch_after_file_change();

REVOKE ALL ON FUNCTION public.recompute_file_batch_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_file_batch_after_file_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_role_update_nonadmin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_file_status() FROM PUBLIC, anon, authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('files', 'files', false)
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
