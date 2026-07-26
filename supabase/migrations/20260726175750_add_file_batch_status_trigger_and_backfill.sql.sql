/*
# Auto-approve file batches for admin/trusted uploaders

## Problem
Multi-file uploads insert a row into `file_batches` (the parent) plus child rows
into `files`. The `files` table already has a BEFORE INSERT trigger
(`trg_set_file_status` -> `set_file_status()`) that forces `status = 'approved'`
when the uploader's `profiles.role` is `'admin'` or `'trusted'`. The
`file_batches` table has NO equivalent trigger, so batches always default to
`'pending'` — even when an admin uploads them. This produced the bug where an
admin's multi-file box stays "pending" / not auto-approved, while its individual
child files are correctly approved.

## Changes
1. New function `set_file_batch_status()` — BEFORE INSERT trigger function on
   `file_batches` that mirrors `set_file_status()` for the status logic only
   (no extension/size/rate-limit checks, which belong to the per-file trigger):
     - looks up the uploader's role in `public.profiles`
     - sets `NEW.status := 'approved'` when role is `'admin'` or `'trusted'`
     - otherwise leaves `NEW.status` as supplied / default (`'pending'`)
2. New trigger `trg_set_file_batch_status` BEFORE INSERT ON `file_batches`.
3. Backfill: set `status = 'approved'` on existing `file_batches` rows whose
   uploader has role `'admin'` or `'trusted'` and are still `'pending'`, so
   already-uploaded admin batches become visible immediately.

## Security
- No RLS policy changes. `file_batches` RLS remains enabled.
- The trigger function is `SECURITY DEFINER` (same pattern as the existing
  `set_file_status()`) so it can read `public.profiles` regardless of the
  caller's RLS context. It only reads the role; it never exposes it.

## Important notes
- This is additive and idempotent: `CREATE OR REPLACE FUNCTION` and
  `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` make it safe to re-run.
- No columns are dropped, renamed, or retyped — no data loss.
- Existing admin batches stuck at 'pending' are repaired in place.
*/

CREATE OR REPLACE FUNCTION public.set_file_batch_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uploader_role text;
BEGIN
  SELECT role INTO uploader_role FROM public.profiles WHERE id = NEW.uploader_id;

  IF uploader_role IN ('admin', 'trusted') THEN
    NEW.status := 'approved';
  ELSE
    NEW.status := COALESCE(NEW.status, 'pending');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_file_batch_status ON public.file_batches;
CREATE TRIGGER trg_set_file_batch_status
BEFORE INSERT ON public.file_batches
FOR EACH ROW EXECUTE FUNCTION public.set_file_batch_status();

UPDATE public.file_batches b
SET status = 'approved'
WHERE b.status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = b.uploader_id
      AND p.role IN ('admin', 'trusted')
  );
