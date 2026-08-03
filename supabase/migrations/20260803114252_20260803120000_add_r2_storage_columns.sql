/*
# Add R2 storage columns to files table

## Overview
This migration adds support for Cloudflare R2 as an alternative storage provider
alongside the existing Supabase Storage. It introduces columns to track the
storage provider, the R2 object key, a SHA-256 content hash for deduplication,
and the verified MIME type. All existing files remain fully functional —
they default to the Supabase storage provider.

## New Columns on `public.files`
1. `storage_provider` (text, nullable, default 'supabase')
   - Values: 'supabase' (legacy), 'r2' (Cloudflare R2), NULL (treated as 'supabase').
2. `object_key` (text, nullable) — The R2 object key.
3. `file_hash` (text, nullable) — SHA-256 hash for deduplication.
4. `mime_type` (text, nullable) — Server-verified MIME type.

## Indexes
- `idx_files_storage_provider`, `idx_files_object_key`
- `idx_files_file_hash_subject`, `idx_files_file_hash_uploader`
- `uq_files_hash_subject` — partial unique index for dedup within subject.

## New Table: `r2_cleanup_queue`
- Tracks R2 objects that need deletion but failed. Admin-only access.

## New Function: `check_upload_rate`
- SECURITY DEFINER function for Worker to check rate limits.

## Backward Compatibility
- All existing files keep working. No columns removed or renamed.
- No data migrated — old files stay in Supabase Storage.
*/

-- 1. Add new columns to files
ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS storage_provider text DEFAULT 'supabase';

ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS object_key text;

ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS file_hash text;

ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS mime_type text;

-- 2. CHECK constraint for storage_provider
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'files_storage_provider_check'
      AND conrelid = 'public.files'::regclass
  ) THEN
    ALTER TABLE public.files
      ADD CONSTRAINT files_storage_provider_check
      CHECK (storage_provider IS NULL OR storage_provider IN ('supabase', 'r2'));
  END IF;
END;
$$;

-- 3. CHECK constraint for object_key format (path traversal protection)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'files_object_key_format_check'
      AND conrelid = 'public.files'::regclass
  ) THEN
    ALTER TABLE public.files
      ADD CONSTRAINT files_object_key_format_check
      CHECK (
        object_key IS NULL OR
        object_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|doc|docx|ppt|pptx|png|jpg|jpeg)$'
      );
  END IF;
END;
$$;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_files_storage_provider ON public.files(storage_provider);
CREATE INDEX IF NOT EXISTS idx_files_object_key ON public.files(object_key);
CREATE INDEX IF NOT EXISTS idx_files_file_hash_subject ON public.files(file_hash, subject_id) WHERE file_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_files_file_hash_uploader ON public.files(file_hash, uploader_id) WHERE file_hash IS NOT NULL;

-- 5. Partial unique index for deduplication within a subject
CREATE UNIQUE INDEX IF NOT EXISTS uq_files_hash_subject
  ON public.files (file_hash, subject_id)
  WHERE file_hash IS NOT NULL;

-- 6. r2_cleanup_queue table
CREATE TABLE IF NOT EXISTS public.r2_cleanup_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_key text NOT NULL,
  reason text NOT NULL DEFAULT 'delete_failed',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.r2_cleanup_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "r2_cleanup_select_admin" ON public.r2_cleanup_queue;
CREATE POLICY "r2_cleanup_select_admin" ON public.r2_cleanup_queue
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "r2_cleanup_insert_admin" ON public.r2_cleanup_queue;
CREATE POLICY "r2_cleanup_insert_admin" ON public.r2_cleanup_queue
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "r2_cleanup_update_admin" ON public.r2_cleanup_queue;
CREATE POLICY "r2_cleanup_update_admin" ON public.r2_cleanup_queue
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "r2_cleanup_delete_admin" ON public.r2_cleanup_queue;
CREATE POLICY "r2_cleanup_delete_admin" ON public.r2_cleanup_queue
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_r2_cleanup_status ON public.r2_cleanup_queue(status);
CREATE INDEX IF NOT EXISTS idx_r2_cleanup_object_key ON public.r2_cleanup_queue(object_key);

-- 7. check_upload_rate function
CREATE OR REPLACE FUNCTION public.check_upload_rate(
  p_user_id uuid,
  p_max int DEFAULT 5,
  p_window_minutes int DEFAULT 10
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT (
    SELECT count(*)::int
    FROM public.files
    WHERE uploader_id = p_user_id
      AND created_at > now() - (p_window_minutes || ' minutes')::interval
  ) < p_max;
$$;

GRANT EXECUTE ON FUNCTION public.check_upload_rate(uuid, int, int) TO authenticated, anon;

-- 8. Update set_file_status to default storage_provider
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
  IF uploader_role IN ('admin', 'trusted') THEN
    NEW.status := 'approved';
  ELSE
    NEW.status := 'pending';
  END IF;

  IF NEW.storage_provider IS NULL THEN
    NEW.storage_provider := 'supabase';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_file_status() FROM PUBLIC, anon, authenticated;