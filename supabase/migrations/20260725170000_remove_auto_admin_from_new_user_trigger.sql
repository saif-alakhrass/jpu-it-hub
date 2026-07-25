/*
# Remove automatic admin assignment from the new-user trigger

## Overview
Previously the `handle_new_user()` trigger automatically promoted the very
first user to sign up to the `admin` role. This created a security risk:
whoever happened to register first gained full administrative control
(approve/reject uploads, delete files, manage subjects) with no manual review.
Admin roles must now be granted only through explicit, manual action.

## Changes
1. Recreate `public.handle_new_user()` so EVERY new user is assigned the
   `student` role. The "is this the first user?" check is removed entirely.
2. Rebind the `on_auth_user_created` trigger to the updated function.
3. The function keeps `SECURITY DEFINER` and an explicit `search_path = public`
   so it continues to fire correctly regardless of the search_path the
   Supabase auth service (GoTrue) uses when invoking the trigger.

## What is NOT changed
- No tables are dropped, no columns are altered, no data is deleted.
- Existing profiles keep their current roles. Any account that already
  received `admin` via the old logic keeps it until an administrator
  manually changes it.
- `is_admin()`, `set_file_status()`, all RLS policies, and the `files`
  storage bucket are unchanged.

## How admins are now assigned
Manually, by updating the `profiles.role` column directly, e.g.:

    UPDATE profiles SET role = 'admin' WHERE id = '<user-uuid>';

This should be done only from the Supabase dashboard / SQL editor or an
explicit admin-management screen — never automatically on signup.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'student'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
