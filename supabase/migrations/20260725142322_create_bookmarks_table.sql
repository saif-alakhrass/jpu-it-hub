/*
# Create bookmarks table for the Saved Items / Bookmarking feature

## Purpose
Allows users to save references to resources (files) without duplicating the
original file in Storage. Each bookmark is a lightweight relational pointer
that stores the user_id, resource_id, an optional folder_name (defaulting to
the subject/course name), and an optional personal note.

## 1. New Table: bookmarks
- id (uuid, primary key, auto-generated)
- user_id (uuid, foreign key → auth.users, ON DELETE CASCADE, defaults to auth.uid())
- resource_id (uuid, foreign key → public.files, ON DELETE CASCADE)
- folder_name (text, defaults to the subject name of the bookmarked resource)
- note (text, nullable — optional personal note)
- created_at (timestamptz, defaults to now())

## 2. Constraints
- UNIQUE (user_id, resource_id) — prevents duplicate bookmarks per user per resource.
- Foreign keys cascade deletes: if a user is deleted their bookmarks go; if a file
  is deleted its bookmarks go. Deleting a bookmark record itself NEVER touches the file.

## 3. Security (RLS)
- RLS enabled on bookmarks.
- Four owner-scoped policies (SELECT / INSERT / UPDATE / DELETE), scoped TO authenticated
  using auth.uid() = user_id. The user_id column defaults to auth.uid() so inserts that
  omit user_id still satisfy the INSERT WITH CHECK.

## 4. Indexes
- Index on user_id for fast "my bookmarks" queries.
- Index on (user_id, folder_name) for folder-grouped rendering.
*/

CREATE TABLE IF NOT EXISTS public.bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  folder_name text NOT NULL DEFAULT 'عام',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookmarks_user_resource_unique UNIQUE (user_id, resource_id)
);

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_bookmarks" ON public.bookmarks;
CREATE POLICY "select_own_bookmarks" ON public.bookmarks
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_bookmarks" ON public.bookmarks;
CREATE POLICY "insert_own_bookmarks" ON public.bookmarks
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_bookmarks" ON public.bookmarks;
CREATE POLICY "update_own_bookmarks" ON public.bookmarks
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_bookmarks" ON public.bookmarks;
CREATE POLICY "delete_own_bookmarks" ON public.bookmarks
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON public.bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_folder ON public.bookmarks(user_id, folder_name);
