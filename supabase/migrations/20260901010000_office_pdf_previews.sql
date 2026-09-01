/*
 * Lazy, private PDF previews for Office documents.
 *
 * The original R2 object remains files.object_key. This migration stores only
 * immutable preview metadata; signed URLs are never persisted. All state
 * transitions are server-only and use row locks so duplicate HTTP requests and
 * at-least-once Queue delivery cannot create competing conversion jobs.
 */

ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS preview_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS preview_object_key text,
  ADD COLUMN IF NOT EXISTS preview_source_hash text,
  ADD COLUMN IF NOT EXISTS preview_converter_version text,
  ADD COLUMN IF NOT EXISTS preview_error_code text,
  ADD COLUMN IF NOT EXISTS preview_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preview_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS preview_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS preview_lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS preview_pdf_size bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'files_preview_status_check'
      AND conrelid = 'public.files'::regclass
  ) THEN
    ALTER TABLE public.files
      ADD CONSTRAINT files_preview_status_check
      CHECK (preview_status IN ('none', 'queued', 'processing', 'ready', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'files_preview_attempts_check'
      AND conrelid = 'public.files'::regclass
  ) THEN
    ALTER TABLE public.files
      ADD CONSTRAINT files_preview_attempts_check
      CHECK (preview_attempts BETWEEN 0 AND 10);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'files_preview_source_hash_check'
      AND conrelid = 'public.files'::regclass
  ) THEN
    ALTER TABLE public.files
      ADD CONSTRAINT files_preview_source_hash_check
      CHECK (preview_source_hash IS NULL OR preview_source_hash ~ '^[0-9a-f]{64}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'files_preview_object_key_check'
      AND conrelid = 'public.files'::regclass
  ) THEN
    ALTER TABLE public.files
      ADD CONSTRAINT files_preview_object_key_check
      CHECK (
        preview_object_key IS NULL OR
        preview_object_key ~ '^previews/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}-v[0-9]+\.pdf$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'files_ready_preview_integrity_check'
      AND conrelid = 'public.files'::regclass
  ) THEN
    ALTER TABLE public.files
      ADD CONSTRAINT files_ready_preview_integrity_check
      CHECK (
        preview_status <> 'ready' OR (
          preview_object_key IS NOT NULL AND
          preview_source_hash IS NOT NULL AND
          preview_converter_version IS NOT NULL AND
          preview_ready_at IS NOT NULL AND
          preview_pdf_size > 4
        )
      );
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_files_preview_object_key
  ON public.files(preview_object_key)
  WHERE preview_object_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_files_preview_work
  ON public.files(preview_status, preview_requested_at)
  WHERE preview_status IN ('queued', 'processing');

CREATE OR REPLACE FUNCTION public.request_office_preview(
  p_file_id uuid,
  p_source_hash text,
  p_converter_version text
)
RETURNS TABLE (
  status text,
  object_key text,
  should_enqueue boolean,
  retry_after_seconds integer,
  error_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target public.files%ROWTYPE;
  source_changed boolean;
BEGIN
  SELECT * INTO target FROM public.files WHERE id = p_file_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'File not found'; END IF;
  IF lower(coalesce(target.file_type, '')) NOT IN ('doc', 'docx', 'ppt', 'pptx') THEN
    RAISE EXCEPTION 'File is not an Office document';
  END IF;
  IF target.storage_provider IS DISTINCT FROM 'r2' OR target.object_key IS NULL THEN
    RAISE EXCEPTION 'Office preview requires an R2 source object';
  END IF;
  IF p_source_hash !~ '^[0-9a-f]{64}$' OR target.file_hash IS DISTINCT FROM p_source_hash THEN
    RAISE EXCEPTION 'Source hash mismatch';
  END IF;
  IF p_converter_version !~ '^v[0-9]+$' THEN RAISE EXCEPTION 'Invalid converter version'; END IF;

  IF target.preview_status = 'ready'
     AND target.preview_source_hash = p_source_hash
     AND target.preview_converter_version = p_converter_version
     AND target.preview_object_key IS NOT NULL THEN
    RETURN QUERY SELECT 'ready'::text, target.preview_object_key, false, 0, NULL::text;
    RETURN;
  END IF;

  IF target.preview_status IN ('queued', 'processing')
     AND target.preview_source_hash = p_source_hash
     AND target.preview_converter_version = p_converter_version
     AND (target.preview_status = 'queued' OR target.preview_lease_until > now()) THEN
    RETURN QUERY SELECT target.preview_status, NULL::text, false, 2, target.preview_error_code;
    RETURN;
  END IF;

  source_changed := target.preview_source_hash IS DISTINCT FROM p_source_hash
    OR target.preview_converter_version IS DISTINCT FROM p_converter_version;

  IF NOT source_changed AND target.preview_status = 'failed' AND target.preview_attempts >= 3 THEN
    RETURN QUERY SELECT 'failed'::text, NULL::text, false, 0, target.preview_error_code;
    RETURN;
  END IF;

  UPDATE public.files
  SET preview_status = 'queued',
      preview_object_key = NULL,
      preview_source_hash = p_source_hash,
      preview_converter_version = p_converter_version,
      preview_error_code = NULL,
      preview_attempts = CASE WHEN source_changed THEN 0 ELSE preview_attempts END,
      preview_requested_at = now(),
      preview_ready_at = NULL,
      preview_lease_until = NULL,
      preview_pdf_size = NULL
  WHERE id = p_file_id;

  RETURN QUERY SELECT 'queued'::text, NULL::text, true, 2, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_office_preview_conversion(
  p_file_id uuid,
  p_source_hash text,
  p_converter_version text,
  p_lease_seconds integer DEFAULT 120
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE changed_rows integer;
BEGIN
  IF p_lease_seconds NOT BETWEEN 30 AND 600 THEN RAISE EXCEPTION 'Invalid lease'; END IF;
  UPDATE public.files
  SET preview_status = 'processing',
      preview_attempts = preview_attempts + 1,
      preview_lease_until = now() + make_interval(secs => p_lease_seconds),
      preview_error_code = NULL
  WHERE id = p_file_id
    AND preview_source_hash = p_source_hash
    AND preview_converter_version = p_converter_version
    AND preview_attempts < 3
    AND (
      preview_status = 'queued'
      OR (preview_status = 'processing' AND preview_lease_until <= now())
    );
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  RETURN changed_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_office_preview_for_retry(
  p_file_id uuid,
  p_source_hash text,
  p_converter_version text,
  p_error_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.files
  SET preview_status = 'queued',
      preview_error_code = left(coalesce(p_error_code, 'conversion_failed'), 80),
      preview_lease_until = NULL
  WHERE id = p_file_id
    AND preview_status = 'processing'
    AND preview_source_hash = p_source_hash
    AND preview_converter_version = p_converter_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_office_preview(
  p_file_id uuid,
  p_source_hash text,
  p_converter_version text,
  p_object_key text,
  p_pdf_size bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE changed_rows integer;
BEGIN
  IF p_object_key !~ '^previews/[0-9a-f-]{36}/[0-9a-f]{64}-v[0-9]+\.pdf$' THEN
    RAISE EXCEPTION 'Invalid preview key';
  END IF;
  IF p_pdf_size NOT BETWEEN 5 AND 52428800 THEN RAISE EXCEPTION 'Invalid preview size'; END IF;
  UPDATE public.files
  SET preview_status = 'ready',
      preview_object_key = p_object_key,
      preview_error_code = NULL,
      preview_ready_at = now(),
      preview_lease_until = NULL,
      preview_pdf_size = p_pdf_size
  WHERE id = p_file_id
    AND preview_status = 'processing'
    AND preview_source_hash = p_source_hash
    AND preview_converter_version = p_converter_version;
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  RETURN changed_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_office_preview(
  p_file_id uuid,
  p_source_hash text,
  p_converter_version text,
  p_error_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.files
  SET preview_status = 'failed',
      preview_object_key = NULL,
      preview_error_code = left(coalesce(p_error_code, 'conversion_failed'), 80),
      preview_ready_at = NULL,
      preview_lease_until = NULL,
      preview_pdf_size = NULL
  WHERE id = p_file_id
    AND preview_source_hash = p_source_hash
    AND preview_converter_version = p_converter_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_file_preview_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Preview metadata is server-managed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_file_preview_metadata ON public.files;
CREATE TRIGGER trg_protect_file_preview_metadata
  BEFORE UPDATE OF preview_status, preview_object_key, preview_source_hash,
    preview_converter_version, preview_error_code, preview_attempts,
    preview_requested_at, preview_ready_at, preview_lease_until, preview_pdf_size
  ON public.files
  FOR EACH ROW EXECUTE FUNCTION public.protect_file_preview_metadata();

REVOKE ALL ON FUNCTION public.request_office_preview(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_office_preview_conversion(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_office_preview_for_retry(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_office_preview(uuid, text, text, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_office_preview(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_file_preview_metadata() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.request_office_preview(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_office_preview_conversion(uuid, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_office_preview_for_retry(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_office_preview(uuid, text, text, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_office_preview(uuid, text, text, text) TO service_role;
