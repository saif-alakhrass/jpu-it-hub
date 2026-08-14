/* Keep the database rate limit authoritative across browser sessions and Worker isolates. */

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
  upload_limit := CASE uploader_role
    WHEN 'admin' THEN 50
    WHEN 'trusted' THEN 20
    ELSE 10
  END;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.uploader_id::text));
  SELECT count(*) INTO recent_count
  FROM public.files
  WHERE uploader_id = NEW.uploader_id
    AND created_at > now() - interval '10 minutes';

  IF recent_count >= upload_limit THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum % uploads per 10 minutes', upload_limit;
  END IF;

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

REVOKE ALL ON FUNCTION public.set_file_status() FROM PUBLIC, anon, authenticated;
