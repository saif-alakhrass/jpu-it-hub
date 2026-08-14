/* Batch uploads must never bypass moderation, and batch operations are atomic. */

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
  upload_limit integer;
BEGIN
  IF NEW.file_type IS NULL OR NOT (lower(NEW.file_type) = ANY(allowed_ext)) THEN
    RAISE EXCEPTION 'File type not allowed: %', NEW.file_type;
  END IF;
  IF NEW.file_size IS NOT NULL AND NEW.file_size > max_size_bytes THEN
    RAISE EXCEPTION 'File too large: maximum 20 MB';
  END IF;

  SELECT role INTO uploader_role FROM public.profiles WHERE id = NEW.uploader_id;
  upload_limit := CASE uploader_role WHEN 'admin' THEN 50 WHEN 'trusted' THEN 20 ELSE 10 END;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.uploader_id::text));
  SELECT count(*) INTO recent_count FROM public.files
    WHERE uploader_id = NEW.uploader_id AND created_at > now() - interval '10 minutes';
  IF recent_count >= upload_limit THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum % uploads per 10 minutes', upload_limit;
  END IF;

  -- A folder is a review unit: only an administrator can publish its children
  -- directly. This overrides client-supplied status and trusted-role defaults.
  IF NEW.batch_id IS NOT NULL AND uploader_role <> 'admin' THEN
    NEW.status := 'pending';
  ELSIF uploader_role IN ('admin', 'trusted') THEN
    NEW.status := 'approved';
  ELSE
    NEW.status := 'pending';
  END IF;

  IF NEW.storage_provider IS NULL THEN NEW.storage_provider := 'supabase'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_file_batch_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uploader_role text;
BEGIN
  SELECT role INTO uploader_role FROM public.profiles WHERE id = NEW.uploader_id;
  IF uploader_role IS DISTINCT FROM 'admin' THEN NEW.status := 'pending'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_file_batch_status ON public.file_batches;
CREATE TRIGGER trg_set_file_batch_status
  BEFORE INSERT ON public.file_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_file_batch_status();

CREATE OR REPLACE FUNCTION public.admin_update_pending_batch(
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
  IF NOT EXISTS (SELECT 1 FROM public.file_batches WHERE id = p_batch_id AND status = 'pending' FOR UPDATE) THEN
    RAISE EXCEPTION 'Pending batch not found';
  END IF;

  UPDATE public.file_batches
    SET title = btrim(p_title), box_name = btrim(p_title), subject_id = p_subject_id, tab = p_tab
    WHERE id = p_batch_id;
  UPDATE public.files
    SET title = title, box_name = btrim(p_title), subject_id = p_subject_id, tab = p_tab
    WHERE batch_id = p_batch_id AND status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_group_pending_files(p_file_ids uuid[], p_title text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_subject uuid;
  target_tab text;
  target_batch uuid;
  selected_count integer;
  expected_count integer;
  subject_count integer;
  tab_count integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator privileges required'; END IF;
  IF char_length(btrim(p_title)) NOT BETWEEN 2 AND 180 THEN RAISE EXCEPTION 'Invalid batch title'; END IF;
  expected_count := coalesce(array_length(p_file_ids, 1), 0);
  IF expected_count < 1 THEN RAISE EXCEPTION 'Select at least one file'; END IF;

  PERFORM 1 FROM public.files WHERE id = ANY(p_file_ids) FOR UPDATE;
  SELECT count(*), min(subject_id::text)::uuid, min(tab), count(DISTINCT subject_id), count(DISTINCT tab)
    INTO selected_count, target_subject, target_tab, subject_count, tab_count
    FROM public.files
    WHERE id = ANY(p_file_ids) AND status = 'pending' AND batch_id IS NULL;
  IF selected_count <> expected_count THEN RAISE EXCEPTION 'All selected files must be pending standalone files'; END IF;
  IF subject_count <> 1 OR tab_count <> 1 THEN
    RAISE EXCEPTION 'Selected files must belong to the same subject and section';
  END IF;

  INSERT INTO public.file_batches (subject_id, tab, title, box_name, uploader_id, status, file_count)
  VALUES (target_subject, target_tab, btrim(p_title), btrim(p_title), auth.uid(), 'pending', selected_count)
  RETURNING id INTO target_batch;
  UPDATE public.files SET batch_id = target_batch, box_name = btrim(p_title) WHERE id = ANY(p_file_ids);
  RETURN target_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.set_file_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_file_batch_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_pending_batch(uuid, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_group_pending_files(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_pending_batch(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_group_pending_files(uuid[], text) TO authenticated;
