/* Automatically promote students after 20 distinct approved contributions. */

CREATE OR REPLACE FUNCTION public.approved_contribution_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(DISTINCT coalesce(nullif(file_hash, ''), id::text))::integer
  FROM public.files
  WHERE uploader_id = p_user_id
    AND status = 'approved';
$$;

CREATE OR REPLACE FUNCTION public.promote_uploader_if_eligible(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_role text;
  current_is_super_admin boolean;
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;

  -- Serialize concurrent approvals for the same uploader.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT role, is_super_admin
  INTO current_role, current_is_super_admin
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  -- Never alter trusted/admin/super-admin accounts or unknown profiles.
  IF current_role IS DISTINCT FROM 'student' OR current_is_super_admin IS TRUE THEN
    RETURN false;
  END IF;

  IF public.approved_contribution_count(p_user_id) < 20 THEN
    RETURN false;
  END IF;

  UPDATE public.profiles
  SET role = 'trusted'
  WHERE id = p_user_id
    AND role = 'student'
    AND is_super_admin = false;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_approved_contribution_promotion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved'
     AND OLD.status IS DISTINCT FROM 'approved' THEN
    PERFORM public.promote_uploader_if_eligible(NEW.uploader_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promote_approved_contributor ON public.files;
CREATE TRIGGER trg_promote_approved_contributor
  AFTER UPDATE OF status ON public.files
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_approved_contribution_promotion();

CREATE OR REPLACE FUNCTION public.get_my_contribution_progress()
RETURNS TABLE (
  approved_count integer,
  target_count integer,
  remaining_count integer,
  role_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  contributions integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  contributions := public.approved_contribution_count(caller_id);

  RETURN QUERY
  SELECT
    contributions,
    20,
    greatest(20 - contributions, 0),
    profiles.role
  FROM public.profiles
  WHERE profiles.id = caller_id;
END;
$$;

-- Existing eligible students should receive the same deterministic result.
SELECT public.promote_uploader_if_eligible(id)
FROM public.profiles
WHERE role = 'student'
  AND is_super_admin = false;

REVOKE ALL ON FUNCTION public.approved_contribution_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promote_uploader_if_eligible(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_approved_contribution_promotion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_contribution_progress() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_contribution_progress() TO authenticated;
