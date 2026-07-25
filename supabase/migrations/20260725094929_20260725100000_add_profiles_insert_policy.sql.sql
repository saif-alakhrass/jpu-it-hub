/*
# Add INSERT policy on profiles as a safety net

1. Purpose
   The `handle_new_user()` trigger is SECURITY DEFINER owned by `postgres`,
   so it already bypasses RLS when inserting a profile row on signup.
   However, there was no explicit INSERT policy on `profiles`, which is a
   latent gap: any future code path that inserts via the anon-key client
   (instead of the trigger) would be silently rejected.

   This migration adds an INSERT policy that allows an authenticated user
   to insert only their own profile row. This closes the gap without
   weakening security — the trigger remains the primary insertion path.

2. Security
   - New policy `profiles_insert_self` scoped `TO authenticated`.
   - WITH CHECK ensures the inserted row's id matches the caller's auth.uid().
   - No changes to existing SELECT/UPDATE policies.
   - Idempotent: DROP IF EXISTS before CREATE.
*/

DROP POLICY IF EXISTS "profiles_insert_self" ON profiles;
CREATE POLICY "profiles_insert_self" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);