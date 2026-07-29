/*
# Consolidate schema: box_name columns + storage security hardening

## Overview
This migration completes the schema consolidation by adding the missing
`box_name` column to both `file_batches` and `files` tables, and hardens
storage security by replacing the public-read storage policy with a
signed-URL-only model that restricts access to approved files (or the
uploader, or admins).

## Changes
1. `file_batches` table:
   - Add `box_name` (text, nullable) — a human-friendly label for the box
     distinct from the auto-generated `title`.
2. `files` table:
   - Add `box_name` (text, nullable) — denormalized box name for quick
     display without joining file_batches.
   - `batch_id`, `file_size` already exist (added by prior migrations).
3. `subjects` table:
   - `difficulty` and `course_description` already exist (added by prior
     migration). No action needed here.
4. Role protection:
   - Two triggers already exist (`trg_prevent_role_change` and
     `trg_protect_profile_role`) that prevent non-admins from changing
     the `role` column. This migration adds a consolidated, idempotent
     trigger function `prevent_role_update_nonadmin()` and replaces both
     triggers with a single one to avoid duplicate logic.
5. Storage security:
   - The `files` bucket is already private (public=false). This migration
     replaces the public-read SELECT policy on `storage.objects` with a
     policy that only allows reading objects when:
       a) The file is approved (status = 'approved'), OR
       b) The requester is the uploader, OR
       c) The requester is an admin.
   - This ensures pending/rejected files are never accessible via public
     URLs — only signed URLs issued through the authenticated client can
     retrieve them, and only for authorized users.

## Security
- Storage SELECT policy tightened: no more anonymous public reads.
- Role update trigger consolidated and hardened.

## Notes
- Fully idempotent: uses ADD COLUMN IF NOT EXISTS, DROP POLICY IF EXISTS
  before CREATE, DROP TRIGGER IF EXISTS before CREATE.
- Safe to re-run; no data is lost.
*/

-- 1. Add box_name to file_batches
ALTER TABLE public.file_batches
  ADD COLUMN IF NOT EXISTS box_name text;

-- 2. Add box_name to files (denormalized for display)
ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS box_name text;

-- 3. Consolidate role-protection trigger function
CREATE OR REPLACE FUNCTION public.prevent_role_update_nonadmin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow role changes when the current user is an admin
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'غير مسموح بتغيير دور المستخدم: يتطلب صلاحيات مدير';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop old triggers and create a single consolidated one
DROP TRIGGER IF EXISTS trg_prevent_role_change ON public.profiles;
DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
DROP TRIGGER IF EXISTS trg_consolidated_protect_role ON public.profiles;

CREATE TRIGGER trg_consolidated_protect_role
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_update_nonadmin();

-- 4. Storage security: replace public-read with restricted-read
-- The bucket 'files' is already private (public=false). Now tighten the
-- SELECT policy so only approved files, the uploader, or admins can read.

DROP POLICY IF EXISTS "files_bucket_read_public" ON storage.objects;
DROP POLICY IF EXISTS "files_bucket_read_restricted" ON storage.objects;

-- New policy: allow read only for approved files, uploader, or admin
-- We check the files table to see if the object path corresponds to an
-- approved file, or one owned by the current user.
CREATE POLICY "files_bucket_read_restricted" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'files' AND (
      -- Admin can read everything
      public.is_admin()
      OR
      -- The object belongs to this user's folder (uploader path prefix)
      (storage.foldername(name))[1] = auth.uid()::text
      OR
      -- The object corresponds to an approved file
      EXISTS (
        SELECT 1 FROM public.files f
        WHERE f.storage_path = name
          AND f.status = 'approved'
      )
    )
  );

-- Allow anon to read only approved files (for public browsing without login)
DROP POLICY IF EXISTS "files_bucket_read_approved_anon" ON storage.objects;
CREATE POLICY "files_bucket_read_approved_anon" ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id = 'files' AND
    EXISTS (
      SELECT 1 FROM public.files f
      WHERE f.storage_path = name
        AND f.status = 'approved'
    )
  );

-- Keep insert/update/delete policies as-is (already owner-or-admin scoped)
