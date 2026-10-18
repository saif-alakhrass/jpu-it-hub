/*
  JPU-IT Hub V2 — private Moodle identity and server-owned academic sync.

  This migration intentionally does not replace Supabase Auth. Moodle proves
  the university identity, while Supabase continues to issue the application
  session used by every existing RLS policy.
*/

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

CREATE TABLE IF NOT EXISTS private.academic_identities (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_user_id text NOT NULL,
  student_id text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  CONSTRAINT academic_identity_provider_user_unique UNIQUE (provider, provider_user_id),
  CONSTRAINT academic_identity_provider_student_unique UNIQUE (provider, student_id)
);

CREATE TABLE IF NOT EXISTS public.academic_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  external_id text NOT NULL,
  short_name text,
  full_name text NOT NULL,
  start_at timestamptz,
  end_at timestamptz,
  source_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_courses_provider_external_unique UNIQUE (provider, external_id)
);

CREATE TABLE IF NOT EXISTS public.student_enrollments (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.academic_courses(id) ON DELETE CASCADE,
  term_key text NOT NULL DEFAULT 'current',
  is_active boolean NOT NULL DEFAULT true,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id, term_key)
);

CREATE TABLE IF NOT EXISTS public.course_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.academic_courses(id) ON DELETE CASCADE,
  external_id text,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  room text,
  location text,
  source text NOT NULL DEFAULT 'moodle',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_meetings_time_order CHECK (ends_at > starts_at),
  CONSTRAINT course_meetings_external_unique UNIQUE NULLS NOT DISTINCT
    (enrollment_user_id, course_id, external_id)
);

CREATE TABLE IF NOT EXISTS private.academic_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  courses_seen integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_code text
);

CREATE TABLE IF NOT EXISTS private.academic_login_limits (
  key_hash text NOT NULL,
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 1,
  PRIMARY KEY (key_hash, window_started_at)
);

ALTER TABLE public.academic_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academic_courses_select_enrolled ON public.academic_courses;
CREATE POLICY academic_courses_select_enrolled ON public.academic_courses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_enrollments enrollment
      WHERE enrollment.course_id = academic_courses.id
        AND enrollment.user_id = auth.uid()
        AND enrollment.is_active = true
    ) OR public.is_admin()
  );

DROP POLICY IF EXISTS student_enrollments_select_own ON public.student_enrollments;
CREATE POLICY student_enrollments_select_own ON public.student_enrollments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS course_meetings_select_own ON public.course_meetings;
CREATE POLICY course_meetings_select_own ON public.course_meetings
  FOR SELECT TO authenticated
  USING (enrollment_user_id = auth.uid() OR public.is_admin());

-- No INSERT/UPDATE/DELETE policies are granted to browser roles. All official
-- academic data is written only by the service-role sync transaction below.

CREATE OR REPLACE FUNCTION public.academic_check_login_rate_limit(
  p_key_hash text,
  p_limit integer DEFAULT 8,
  p_window_seconds integer DEFAULT 600
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  current_window timestamptz;
  current_attempts integer;
BEGIN
  IF p_key_hash IS NULL OR length(p_key_hash) < 32 THEN
    RETURN false;
  END IF;

  DELETE FROM private.academic_login_limits
  WHERE window_started_at < now() - interval '1 day';

  SELECT window_started_at, attempts
  INTO current_window, current_attempts
  FROM private.academic_login_limits
  WHERE key_hash = p_key_hash
    AND window_started_at >= now() - make_interval(secs => p_window_seconds)
  ORDER BY window_started_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF current_attempts >= p_limit THEN RETURN false; END IF;
    UPDATE private.academic_login_limits
    SET attempts = attempts + 1
    WHERE key_hash = p_key_hash AND window_started_at = current_window;
    RETURN true;
  END IF;

  INSERT INTO private.academic_login_limits (key_hash, window_started_at)
  VALUES (p_key_hash, now());
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.academic_resolve_user(
  p_provider text,
  p_provider_user_id text,
  p_student_id text,
  p_email text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  resolved_id uuid;
  conflicting_id uuid;
BEGIN
  SELECT user_id INTO resolved_id
  FROM private.academic_identities
  WHERE provider = p_provider
    AND provider_user_id = p_provider_user_id
    AND student_id = p_student_id
  LIMIT 1;

  IF resolved_id IS NOT NULL THEN RETURN resolved_id; END IF;

  SELECT user_id INTO conflicting_id
  FROM private.academic_identities
  WHERE provider = p_provider
    AND (provider_user_id = p_provider_user_id OR student_id = p_student_id)
  LIMIT 1;
  IF conflicting_id IS NOT NULL THEN
    RAISE EXCEPTION 'Academic identity mismatch';
  END IF;

  IF nullif(trim(p_email), '') IS NOT NULL THEN
    SELECT users.id INTO resolved_id
    FROM auth.users users
    LEFT JOIN public.profiles profile ON profile.id = users.id
    WHERE lower(users.email) = lower(trim(p_email))
      -- Administrator accounts require an explicit authenticated pre-link;
      -- Moodle email matching alone can never acquire admin authority.
      AND coalesce(profile.role, 'student') NOT IN ('admin')
      AND coalesce(profile.is_super_admin, false) = false
    ORDER BY users.created_at
    LIMIT 1;
  END IF;

  RETURN resolved_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.academic_complete_sync(
  p_user_id uuid,
  p_provider text,
  p_provider_user_id text,
  p_student_id text,
  p_full_name text,
  p_avatar_url text,
  p_courses jsonb,
  p_term_key text DEFAULT 'current'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  course_data jsonb;
  synced_course_id uuid;
  synced_count integer := 0;
  run_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Unknown auth user';
  END IF;
  IF jsonb_typeof(coalesce(p_courses, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Courses payload must be an array';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  INSERT INTO private.academic_sync_runs (user_id, provider, status)
  VALUES (p_user_id, p_provider, 'running')
  RETURNING id INTO run_id;

  INSERT INTO private.academic_identities (
    user_id, provider, provider_user_id, student_id,
    verified_at, last_login_at, last_sync_at, status
  ) VALUES (
    p_user_id, p_provider, p_provider_user_id, p_student_id,
    now(), now(), now(), 'active'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    provider = EXCLUDED.provider,
    provider_user_id = EXCLUDED.provider_user_id,
    student_id = EXCLUDED.student_id,
    verified_at = now(),
    last_login_at = now(),
    last_sync_at = now(),
    status = 'active';

  -- Deliberately update identity presentation only. Never touch role or the
  -- protected super-admin flag from an external academic provider.
  UPDATE public.profiles
  SET full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
      avatar_url = coalesce(nullif(trim(p_avatar_url), ''), avatar_url)
  WHERE id = p_user_id;

  UPDATE public.student_enrollments enrollment
  SET is_active = false
  FROM public.academic_courses course
  WHERE enrollment.user_id = p_user_id
    AND enrollment.term_key = p_term_key
    AND enrollment.course_id = course.id
    AND course.provider = p_provider;

  FOR course_data IN SELECT value FROM jsonb_array_elements(coalesce(p_courses, '[]'::jsonb))
  LOOP
    IF nullif(course_data->>'id', '') IS NULL OR nullif(course_data->>'fullname', '') IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.academic_courses (
      provider, external_id, short_name, full_name, start_at, end_at,
      source_updated_at, updated_at
    ) VALUES (
      p_provider,
      course_data->>'id',
      nullif(course_data->>'shortname', ''),
      course_data->>'fullname',
      CASE WHEN coalesce((course_data->>'startdate')::bigint, 0) > 0
        THEN to_timestamp((course_data->>'startdate')::bigint) END,
      CASE WHEN coalesce((course_data->>'enddate')::bigint, 0) > 0
        THEN to_timestamp((course_data->>'enddate')::bigint) END,
      now(),
      now()
    )
    ON CONFLICT (provider, external_id) DO UPDATE SET
      short_name = EXCLUDED.short_name,
      full_name = EXCLUDED.full_name,
      start_at = EXCLUDED.start_at,
      end_at = EXCLUDED.end_at,
      source_updated_at = now(),
      updated_at = now()
    RETURNING id INTO synced_course_id;

    INSERT INTO public.student_enrollments (
      user_id, course_id, term_key, is_active, last_seen_at
    ) VALUES (
      p_user_id, synced_course_id, p_term_key, true, now()
    )
    ON CONFLICT (user_id, course_id, term_key) DO UPDATE SET
      is_active = true,
      last_seen_at = now();

    synced_count := synced_count + 1;
  END LOOP;

  UPDATE private.academic_sync_runs
  SET status = 'succeeded', courses_seen = synced_count, finished_at = now()
  WHERE id = run_id;

  RETURN jsonb_build_object(
    'courses_synced', synced_count,
    'synced_at', now(),
    'run_id', run_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.academic_check_login_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.academic_resolve_user(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.academic_complete_sync(uuid, text, text, text, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academic_check_login_rate_limit(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.academic_resolve_user(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.academic_complete_sync(uuid, text, text, text, text, text, jsonb, text) TO service_role;

GRANT SELECT ON public.academic_courses, public.student_enrollments, public.course_meetings TO authenticated;
