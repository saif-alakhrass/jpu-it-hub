/* Super-admin role protection. */

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

DO $$
DECLARE
  oldest_admin_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE is_super_admin = true) THEN
    SELECT id INTO oldest_admin_id
    FROM public.profiles
    WHERE role = 'admin'
    ORDER BY created_at ASC
    LIMIT 1;

    IF oldest_admin_id IS NOT NULL THEN
      UPDATE public.profiles SET is_super_admin = true WHERE id = oldest_admin_id;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.prevent_role_update_nonadmin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  caller_is_super boolean;
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    SELECT role, is_super_admin
    INTO caller_role, caller_is_super
    FROM public.profiles
    WHERE id = auth.uid();

    IF caller_role <> 'admin' THEN
      RAISE EXCEPTION 'Role changes require administrator privileges';
    END IF;

    IF OLD.role = 'admin' AND NEW.role <> 'admin' THEN
      IF caller_is_super IS NOT TRUE THEN
        RAISE EXCEPTION 'Only the Super Admin can demote another administrator';
      END IF;
      IF (SELECT count(*) FROM public.profiles WHERE role = 'admin') <= 1 THEN
        RAISE EXCEPTION 'The final administrator cannot be demoted';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
