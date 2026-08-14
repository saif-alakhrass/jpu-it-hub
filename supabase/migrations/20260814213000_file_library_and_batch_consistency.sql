/* Keep a folder's state authoritative and allow administrators to organize every file safely. */

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

  -- Do not rely only on row triggers: the folder must leave "pending" in the
  -- same transaction as its children.
  PERFORM public.recompute_file_batch_state(p_batch_id);
  RETURN changed_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_file_batch(
  p_batch_id uuid,
  p_title text,
  p_subject_id uuid,
  p_tab text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator privileges required'; END IF;
  IF char_length(btrim(p_title)) NOT BETWEEN 2 AND 180 THEN RAISE EXCEPTION 'Invalid batch title'; END IF;
  IF p_tab NOT IN ('summaries','exams','images','slides') THEN RAISE EXCEPTION 'Invalid tab'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.subjects WHERE id = p_subject_id) THEN RAISE EXCEPTION 'Invalid subject'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.file_batches WHERE id = p_batch_id FOR UPDATE) THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  UPDATE public.file_batches
  SET title = btrim(p_title), box_name = btrim(p_title), subject_id = p_subject_id, tab = p_tab
  WHERE id = p_batch_id;
  UPDATE public.files
  SET box_name = btrim(p_title), subject_id = p_subject_id, tab = p_tab
  WHERE batch_id = p_batch_id;
  PERFORM public.recompute_file_batch_state(p_batch_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_group_files(p_file_ids uuid[], p_title text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_subject uuid;
  target_tab text;
  target_status text;
  target_batch uuid;
  selected_count integer;
  expected_count integer;
  subject_count integer;
  tab_count integer;
  status_count integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator privileges required'; END IF;
  IF char_length(btrim(p_title)) NOT BETWEEN 2 AND 180 THEN RAISE EXCEPTION 'Invalid batch title'; END IF;
  expected_count := coalesce(array_length(p_file_ids, 1), 0);
  IF expected_count < 1 THEN RAISE EXCEPTION 'Select at least one file'; END IF;

  PERFORM 1 FROM public.files WHERE id = ANY(p_file_ids) FOR UPDATE;
  SELECT count(*), min(subject_id::text)::uuid, min(tab), min(status),
         count(DISTINCT subject_id), count(DISTINCT tab), count(DISTINCT status)
    INTO selected_count, target_subject, target_tab, target_status, subject_count, tab_count, status_count
    FROM public.files
    WHERE id = ANY(p_file_ids) AND batch_id IS NULL;

  IF selected_count <> expected_count THEN RAISE EXCEPTION 'All selected files must be standalone files'; END IF;
  IF subject_count <> 1 OR tab_count <> 1 OR status_count <> 1 THEN
    RAISE EXCEPTION 'Selected files must have the same subject, section and status';
  END IF;

  INSERT INTO public.file_batches (subject_id, tab, title, box_name, uploader_id, status, file_count)
  VALUES (target_subject, target_tab, btrim(p_title), btrim(p_title), auth.uid(), target_status, selected_count)
  RETURNING id INTO target_batch;
  UPDATE public.files SET batch_id = target_batch, box_name = btrim(p_title) WHERE id = ANY(p_file_ids);
  PERFORM public.recompute_file_batch_state(target_batch);
  RETURN target_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_moderate_pending_batch(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_file_batch(uuid, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_group_files(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_moderate_pending_batch(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_file_batch(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_group_files(uuid[], text) TO authenticated;
