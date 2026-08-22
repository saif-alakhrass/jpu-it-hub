/*
  Restrict the 'exams' tab to trusted / admin users.

  - Creates a helper function is_trusted_or_admin() for reuse.
  - Replaces the files and file_batches SELECT policies so that
    exams-tab rows are only visible to trusted / admin users.
  - Non-exams tabs keep the existing logic unchanged.
  - Idempotent: safe to re-run.
*/

-- Helper: is the current user trusted or admin?
CREATE OR REPLACE FUNCTION public.is_trusted_or_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('trusted', 'admin')
  );
$$;

-- Replace the files SELECT policy: exams tab requires trusted / admin
DROP POLICY IF EXISTS "files_select_visible" ON public.files;
CREATE POLICY "files_select_visible" ON public.files
  FOR SELECT TO anon, authenticated
  USING (
    -- Non-exams tabs: existing logic (approved, own, or admin)
    (tab <> 'exams' AND (status = 'approved' OR uploader_id = auth.uid() OR public.is_admin()))
    OR
    -- Exams tab: trusted / admin only (they see all statuses)
    (tab = 'exams' AND public.is_trusted_or_admin())
  );

-- Same restriction on file_batches
DROP POLICY IF EXISTS "file_batches_select_visible" ON public.file_batches;
CREATE POLICY "file_batches_select_visible" ON public.file_batches
  FOR SELECT TO anon, authenticated
  USING (
    (tab <> 'exams' AND (status = 'approved' OR uploader_id = auth.uid() OR public.is_admin()))
    OR
    (tab = 'exams' AND public.is_trusted_or_admin())
  );
