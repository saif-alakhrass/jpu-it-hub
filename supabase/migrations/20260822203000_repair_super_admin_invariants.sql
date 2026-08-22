/*
  Keep the super-admin flag and the admin role consistent.
  This repairs existing rows and prevents future accidental demotion.
*/

ALTER TABLE public.profiles
  ALTER COLUMN is_super_admin SET DEFAULT false;

UPDATE public.profiles
SET is_super_admin = false
WHERE is_super_admin IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN is_super_admin SET NOT NULL;

-- A super admin is always an admin. Repair any inconsistent production row.
UPDATE public.profiles
SET role = 'admin'
WHERE is_super_admin = true
  AND role IS DISTINCT FROM 'admin';

-- All authorization helpers must recognize the super-admin flag as admin
-- authority, even during a profile refresh or a partially applied migration.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND (role = 'admin' OR is_super_admin = true)
  );
$$;

CREATE OR REPLACE FUNCTION public.prevent_role_update_nonadmin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_is_admin boolean;
  caller_is_super boolean;
BEGIN
  IF NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.is_super_admin IS NOT DISTINCT FROM OLD.is_super_admin THEN
    RETURN NEW;
  END IF;

  -- Allow trusted server-side migrations/service operations. Browser requests
  -- always have auth.uid() and continue through the checks below.
  IF auth.uid() IS NULL THEN
    IF NEW.is_super_admin = true THEN NEW.role := 'admin'; END IF;
    RETURN NEW;
  END IF;

  SELECT (role = 'admin' OR is_super_admin = true), is_super_admin
  INTO caller_is_admin, caller_is_super
  FROM public.profiles
  WHERE id = auth.uid();

  IF caller_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Role changes require administrator privileges';
  END IF;

  -- The protected account can never be demoted or stripped of its flag from
  -- the application. Recovery remains possible through a privileged migration.
  IF OLD.is_super_admin = true
     AND (NEW.role IS DISTINCT FROM 'admin' OR NEW.is_super_admin IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'The Super Admin account cannot be demoted';
  END IF;

  -- Only the current super admin may promote/demote administrators or change
  -- which account carries the super-admin flag.
  IF (OLD.role IS DISTINCT FROM NEW.role AND (OLD.role = 'admin' OR NEW.role = 'admin'))
     OR OLD.is_super_admin IS DISTINCT FROM NEW.is_super_admin THEN
    IF caller_is_super IS NOT TRUE THEN
      RAISE EXCEPTION 'Only the Super Admin can manage administrator roles';
    END IF;
  END IF;

  IF OLD.role = 'admin' AND NEW.role <> 'admin'
     AND (SELECT count(*) FROM public.profiles WHERE role = 'admin') <= 1 THEN
    RAISE EXCEPTION 'The final administrator cannot be demoted';
  END IF;

  IF NEW.is_super_admin = true THEN
    NEW.role := 'admin';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_change ON public.profiles;
DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
DROP TRIGGER IF EXISTS trg_prevent_role_update_nonadmin ON public.profiles;
DROP TRIGGER IF EXISTS trg_consolidated_protect_role ON public.profiles;
CREATE TRIGGER trg_consolidated_protect_role
  BEFORE UPDATE OF role, is_super_admin ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_update_nonadmin();

-- Anonymous SELECT policies also reference is_admin(); execution is safe
-- because it returns false without an authenticated uid.
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_role_update_nonadmin() FROM PUBLIC, anon, authenticated;
