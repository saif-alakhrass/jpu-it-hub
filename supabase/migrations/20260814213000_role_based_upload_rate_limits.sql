-- Role-based upload limits in a rolling ten-minute window.
-- The trigger is the authoritative enforcement layer; the Worker and UI mirror
-- these values to give users immediate feedback.
CREATE OR REPLACE FUNCTION public.set_file_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uploader_role text;
  recent_count integer;
  max_uploads integer;
  allowed_ext text[] := ARRAY['pdf','doc','docx','ppt','pptx','png','jpg','jpeg'];
  max_size_bytes bigint := 20971520;
BEGIN
  IF NEW.file_type IS NULL OR NOT (lower(NEW.file_type) = ANY(allowed_ext)) THEN
    RAISE EXCEPTION 'File type not allowed: %', NEW.file_type;
  END IF;

  IF NEW.file_size IS NOT NULL AND NEW.file_size > max_size_bytes THEN
    RAISE EXCEPTION 'File too large: maximum 20 MB';
  END IF;

  SELECT role INTO uploader_role FROM public.profiles WHERE id = NEW.uploader_id;
  max_uploads := CASE uploader_role
    WHEN 'admin' THEN 50
    WHEN 'trusted' THEN 20
    ELSE 10
  END;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.uploader_id::text));
  SELECT count(*) INTO recent_count
  FROM public.files
  WHERE uploader_id = NEW.uploader_id
    AND created_at > now() - interval '10 minutes';

  IF recent_count >= max_uploads THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum % uploads per 10 minutes', max_uploads;
  END IF;

  NEW.status := CASE WHEN uploader_role IN ('admin', 'trusted') THEN 'approved' ELSE 'pending' END;
  IF NEW.storage_provider IS NULL THEN NEW.storage_provider := 'supabase'; END IF;
  RETURN NEW;
END;
$$;
