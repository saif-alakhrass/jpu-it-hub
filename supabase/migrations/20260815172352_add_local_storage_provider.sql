-- Allow 'local' as a storage_provider value for files stored in browser IndexedDB.
ALTER TABLE public.files
  DROP CONSTRAINT IF EXISTS files_storage_provider_check;

ALTER TABLE public.files
  ADD CONSTRAINT files_storage_provider_check
  CHECK (storage_provider IS NULL OR storage_provider IN ('supabase', 'r2', 'local'));
