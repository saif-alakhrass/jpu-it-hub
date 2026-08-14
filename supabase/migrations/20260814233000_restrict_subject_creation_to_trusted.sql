/* Students may browse subjects but cannot create them. */

DROP POLICY IF EXISTS "subjects_insert_auth" ON public.subjects;
DROP POLICY IF EXISTS "subjects_insert_trusted_or_admin" ON public.subjects;

CREATE POLICY "subjects_insert_trusted_or_admin" ON public.subjects
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('trusted', 'admin')
    )
  );
