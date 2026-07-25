/*
# Server-side file validation: size + MIME type enforcement

Extends set_file_status() to also validate file_type against an allowlist
and enforce a 20MB size limit (file_size column added to files table).

## Changes
- Adds file_size bigint column to files (nullable, stores upload size in bytes)
- set_file_status() now rejects disallowed extensions and oversized files
*/

-- Add file_size column to store the upload size for server-side validation
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS file_size bigint;

-- Replace set_file_status to include file validation + rate limit + status logic
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
  max_size_bytes bigint := 20971520; -- 20 MB
BEGIN
  -- Validate file extension
  IF NEW.file_type IS NULL OR NOT (lower(NEW.file_type) = ANY(allowed_ext)) THEN
    RAISE EXCEPTION 'File type not allowed: %', NEW.file_type;
  END IF;

  -- Validate file size (if provided)
  IF NEW.file_size IS NOT NULL AND NEW.file_size > max_size_bytes THEN
    RAISE EXCEPTION 'File too large: maximum 20 MB';
  END IF;

  -- Enforce rate limit: max 5 files in the last 10 minutes by the same user
  SELECT count(*) INTO recent_count
  FROM public.files
  WHERE uploader_id = NEW.uploader_id
    AND created_at > now() - interval '10 minutes';

  IF recent_count >= 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum 5 uploads per 10 minutes';
  END IF;

  -- Determine status from uploader role
  SELECT role INTO uploader_role FROM public.profiles WHERE id = NEW.uploader_id;
  IF uploader_role IN ('admin','trusted') THEN
    NEW.status := 'approved';
  ELSE
    NEW.status := 'pending';
  END IF;

  RETURN NEW;
END;
$$;
