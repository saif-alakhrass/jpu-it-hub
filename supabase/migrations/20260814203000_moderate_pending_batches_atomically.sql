/* Approve or reject every pending child of a folder in one admin-only transaction. */

CREATE OR REPLACE FUNCTION public.admin_moderate_pending_batch(
  p_batch_id uuid,
  p_status text,
  p_rejection_reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE changed_count integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator privileges required'; END IF;
  IF p_status NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Invalid moderation status'; END IF;
  IF p_status = 'rejected' AND char_length(btrim(coalesce(p_rejection_reason, ''))) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'A rejection reason between 3 and 500 characters is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.file_batches WHERE id = p_batch_id AND status = 'pending' FOR UPDATE) THEN
    RAISE EXCEPTION 'Pending batch not found';
  END IF;

  UPDATE public.files
  SET status = p_status,
      rejection_reason = CASE WHEN p_status = 'rejected' THEN btrim(p_rejection_reason) ELSE NULL END,
      moderated_at = now(),
      moderated_by = auth.uid()
  WHERE batch_id = p_batch_id AND status = 'pending';
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_moderate_pending_batch(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_moderate_pending_batch(uuid, text, text) TO authenticated;
