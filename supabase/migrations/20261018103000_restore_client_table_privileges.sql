/*
  Fresh Supabase projects do not automatically grant PostgREST roles table
  privileges. RLS policies alone are not enough: without these grants, even
  public reads of subjects fail before RLS is evaluated.

  Keep this list intentionally narrow. The existing RLS policies remain the
  authorization boundary for every authenticated mutation and row read.
*/

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Public library data. RLS still limits files and batches to approved rows.
GRANT SELECT ON TABLE public.subjects, public.files, public.file_batches, public.team_members
  TO anon, authenticated;

-- Signed-in user flows, constrained by their existing RLS policies.
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.subjects, public.files, public.file_batches
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bookmarks TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.notifications TO authenticated;
