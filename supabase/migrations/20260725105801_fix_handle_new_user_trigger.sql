-- Recreate the handle_new_user trigger function with an explicit search_path
-- and schema-qualified table reference. Without search_path = public, the
-- Supabase auth service (GoTrue) may fire the trigger with a search_path
-- that doesn't include the public schema, causing the unqualified
-- "profiles" reference to fail with a 500 on signup.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  first_user boolean;
BEGIN
  SELECT (count(*) = 0) FROM public.profiles INTO first_user;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    CASE WHEN first_user THEN 'admin' ELSE 'student' END
  );

  RETURN NEW;
END;
$$;

-- Drop and recreate the trigger to bind it to the updated function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
