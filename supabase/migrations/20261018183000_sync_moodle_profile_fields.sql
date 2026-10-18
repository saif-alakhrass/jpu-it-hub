/*
  Apply optional academic profile fields returned by Moodle. The external
  provider never receives permission to mutate roles or the super-admin flag.
  Missing provider values preserve the student's existing profile edits.
*/

CREATE OR REPLACE FUNCTION public.academic_update_profile(
  p_user_id uuid,
  p_academic_year text,
  p_department text,
  p_credit_hours integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET academic_year = coalesce(nullif(trim(p_academic_year), ''), academic_year),
      department = coalesce(nullif(trim(p_department), ''), department),
      credit_hours = CASE
        WHEN p_credit_hours BETWEEN 0 AND 400 THEN p_credit_hours
        ELSE credit_hours
      END
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.academic_update_profile(uuid, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academic_update_profile(uuid, text, text, integer)
  TO service_role;
