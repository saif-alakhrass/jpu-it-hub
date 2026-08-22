/*
  Super Admin & Professional Banning System Migration (V2 - Safe Soft Delete & Case Insensitive)
*/

-- 1. Add is_super_admin flag
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false;

-- Auto-assign the oldest admin to be the Super Admin (if none exists)
DO $$
DECLARE
  oldest_admin_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE is_super_admin = true) THEN
    SELECT id INTO oldest_admin_id FROM public.profiles WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1;
    IF oldest_admin_id IS NOT NULL THEN
      UPDATE public.profiles SET is_super_admin = true WHERE id = oldest_admin_id;
    END IF;
  END IF;
END $$;

-- 2. Update role protection trigger
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
    -- Get caller role and super admin status
    SELECT role, is_super_admin INTO caller_role, caller_is_super FROM public.profiles WHERE id = auth.uid();

    -- Only admins can change roles
    IF caller_role <> 'admin' THEN
      RAISE EXCEPTION 'Role changes require administrator privileges';
    END IF;

    -- If target is an admin being demoted
    IF OLD.role = 'admin' AND NEW.role <> 'admin' THEN
      IF caller_is_super IS NOT TRUE THEN
        RAISE EXCEPTION 'Only the Super Admin can demote another administrator';
      END IF;
      -- Check if it's the last admin
      IF (SELECT count(*) FROM public.profiles WHERE role = 'admin') <= 1 THEN
        RAISE EXCEPTION 'The final administrator cannot be demoted';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Banned Identities (Blacklist) Table
CREATE TABLE IF NOT EXISTS public.banned_identities (
  email text PRIMARY KEY,
  banned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ban_type text NOT NULL CHECK (ban_type IN ('temporary', 'permanent')),
  banned_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  reason text
);

ALTER TABLE public.banned_identities ENABLE ROW LEVEL SECURITY;

-- Only admins can read banned identities
DROP POLICY IF EXISTS "banned_identities_select_admin" ON public.banned_identities;
CREATE POLICY "banned_identities_select_admin" ON public.banned_identities
  FOR SELECT TO authenticated
  USING (public.is_admin());


-- 4. Prevent Banned Users from Signing Up (Case Insensitive check)
CREATE OR REPLACE FUNCTION public.prevent_banned_user_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.banned_identities 
    WHERE email = LOWER(NEW.email)
    AND (ban_type = 'permanent' OR (ban_type = 'temporary' AND expires_at > now()))
  ) THEN
    RAISE EXCEPTION 'هذا الحساب محظور ولا يمكنه التسجيل في المنصة.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_banned_user_signup ON auth.users;
CREATE TRIGGER trg_prevent_banned_user_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_banned_user_signup();

-- 5. Ban User RPC (Soft Delete via Banned_Until)
CREATE OR REPLACE FUNCTION public.ban_user(
  target_user_id uuid,
  p_ban_type text,
  p_ban_days int,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller_role text;
  target_email text;
  target_role text;
  normalized_email text;
BEGIN
  -- 1. Check permissions (Admin only)
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role <> 'admin' THEN
    RAISE EXCEPTION 'Access denied. Only administrators can ban users.';
  END IF;

  -- 2. Get target user details
  SELECT email INTO target_email FROM auth.users WHERE id = target_user_id;
  SELECT role INTO target_role FROM public.profiles WHERE id = target_user_id;

  IF target_email IS NULL THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  normalized_email := LOWER(target_email);

  -- 3. Admins cannot ban other admins
  IF target_role = 'admin' THEN
    RAISE EXCEPTION 'Administrators cannot be banned. Demote them first.';
  END IF;

  -- 4. Apply Ban
  IF p_ban_type = 'permanent' THEN
    INSERT INTO public.banned_identities (email, banned_by, ban_type, expires_at, reason)
    VALUES (normalized_email, auth.uid(), 'permanent', NULL, p_reason)
    ON CONFLICT (email) DO UPDATE 
      SET ban_type = 'permanent', expires_at = NULL, reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by, banned_at = now();
    
    -- Soft Delete: Ban forever (Year 3000) preserving DB integrity
    UPDATE auth.users SET banned_until = '3000-01-01 00:00:00+00'::timestamptz WHERE id = target_user_id;

  ELSIF p_ban_type = 'temporary' THEN
    IF p_ban_days IS NULL OR p_ban_days <= 0 THEN
      RAISE EXCEPTION 'Temporary ban requires a valid number of days.';
    END IF;

    INSERT INTO public.banned_identities (email, banned_by, ban_type, expires_at, reason)
    VALUES (normalized_email, auth.uid(), 'temporary', now() + (p_ban_days || ' days')::interval, p_reason)
    ON CONFLICT (email) DO UPDATE 
      SET ban_type = 'temporary', expires_at = EXCLUDED.expires_at, reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by, banned_at = now();

    -- Ban in auth.users so Supabase rejects sessions
    UPDATE auth.users SET banned_until = now() + (p_ban_days || ' days')::interval WHERE id = target_user_id;
  ELSE
    RAISE EXCEPTION 'Invalid ban type.';
  END IF;
END;
$$;

-- 6. Unban User RPC
CREATE OR REPLACE FUNCTION public.unban_user_by_email(target_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller_role text;
  normalized_email text;
BEGIN
  -- Admin only
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role <> 'admin' THEN
    RAISE EXCEPTION 'Access denied. Only administrators can unban users.';
  END IF;

  normalized_email := LOWER(target_email);

  -- Delete from blacklist
  DELETE FROM public.banned_identities WHERE email = normalized_email;

  -- Remove banned_until from auth.users if they still exist
  UPDATE auth.users SET banned_until = NULL WHERE LOWER(email) = normalized_email;
END;
$$;

-- Ensure public cannot execute the RPCs directly
REVOKE ALL ON FUNCTION public.ban_user(uuid, text, int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unban_user_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ban_user(uuid, text, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unban_user_by_email(text) TO authenticated;
