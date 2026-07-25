/*
# Add file batches for grouped uploads

1. New Table
- `file_batches`: represents a single upload "session" that groups multiple files
  uploaded together into a named collection (e.g. "ملخصات الفصل الأول - مجموعة مرفوعة بتاريخ ...").
  - `id` (uuid, primary key)
  - `subject_id` (uuid, FK to subjects, cascade delete)
  - `tab` (text, same tab enum as files: summaries/exams/images/slides)
  - `title` (text, the user-facing batch/folder title)
  - `uploader_id` (uuid, FK to auth.users via profiles, defaults to auth.uid())
  - `status` (text: pending/approved/rejected — mirrors the approval flow of its files)
  - `file_count` (int, denormalized count of files in the batch for fast display)
  - `created_at` (timestamptz)

2. Modified Table
- `files`: add nullable `batch_id` column referencing file_batches.
  - Nullable so existing single-file uploads (and any legacy rows) remain valid.
  - ON DELETE CASCADE: when a batch is deleted, all its files go too.

3. Security
- Enable RLS on `file_batches`.
- SELECT visible to anon/authenticated when approved, or owned, or admin (mirrors files policy).
- INSERT/UPDATE/DELETE scoped to uploader or admin (mirrors files policy).
- Add matching policies so a batch's owner can manage their own batch and admins can manage all.

4. Notes
- Backfill: existing approved/pending files have no batch — they render as standalone cards.
- The `file_count` column is denormalized for cheap display and kept in sync by the app on insert/delete.
*/

CREATE TABLE IF NOT EXISTS file_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  tab text NOT NULL CHECK (tab IN ('summaries','exams','images','slides')),
  title text NOT NULL,
  uploader_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  file_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE file_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "batches_select_visible" ON file_batches;
CREATE POLICY "batches_select_visible"
ON file_batches FOR SELECT
TO anon, authenticated
USING (status = 'approved' OR uploader_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "batches_insert_owner" ON file_batches;
CREATE POLICY "batches_insert_owner"
ON file_batches FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = uploader_id);

DROP POLICY IF EXISTS "batches_update_admin" ON file_batches;
CREATE POLICY "batches_update_admin"
ON file_batches FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

DROP POLICY IF EXISTS "batches_delete_admin" ON file_batches;
CREATE POLICY "batches_delete_admin"
ON file_batches FOR DELETE
TO authenticated
USING (is_admin());

-- Add batch_id to files (nullable: single uploads stay standalone)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'files' AND column_name = 'batch_id') THEN
    ALTER TABLE files ADD COLUMN batch_id uuid REFERENCES file_batches(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS files_batch_id_idx ON files(batch_id);
CREATE INDEX IF NOT EXISTS file_batches_subject_tab_idx ON file_batches(subject_id, tab);
