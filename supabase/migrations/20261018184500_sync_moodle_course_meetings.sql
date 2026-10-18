/*
  Replace only the authenticated student's Moodle-owned recurring meetings.
  Browser roles cannot call this function or write official schedule rows.
*/

CREATE OR REPLACE FUNCTION public.academic_replace_meetings(
  p_user_id uuid,
  p_provider text,
  p_meetings jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  meeting_data jsonb;
  resolved_course_id uuid;
  inserted_count integer := 0;
  parsed_weekday integer;
  parsed_start time;
  parsed_end time;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Unknown auth user';
  END IF;
  IF jsonb_typeof(coalesce(p_meetings, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Meetings payload must be an array';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 1));

  DELETE FROM public.course_meetings meeting
  USING public.academic_courses course
  WHERE meeting.enrollment_user_id = p_user_id
    AND meeting.course_id = course.id
    AND meeting.source = p_provider
    AND course.provider = p_provider;

  FOR meeting_data IN SELECT value FROM jsonb_array_elements(coalesce(p_meetings, '[]'::jsonb))
  LOOP
    IF coalesce(meeting_data->>'course_external_id', '') = ''
      OR coalesce(meeting_data->>'external_id', '') = ''
      OR coalesce(meeting_data->>'weekday', '') !~ '^[0-6]$'
      OR coalesce(meeting_data->>'starts_at', '') !~ '^[0-2][0-9]:[0-5][0-9]$'
      OR coalesce(meeting_data->>'ends_at', '') !~ '^[0-2][0-9]:[0-5][0-9]$'
    THEN
      CONTINUE;
    END IF;

    parsed_weekday := (meeting_data->>'weekday')::integer;
    parsed_start := (meeting_data->>'starts_at')::time;
    parsed_end := (meeting_data->>'ends_at')::time;
    IF parsed_start >= parsed_end THEN CONTINUE; END IF;

    SELECT course.id INTO resolved_course_id
    FROM public.academic_courses course
    JOIN public.student_enrollments enrollment
      ON enrollment.course_id = course.id
     AND enrollment.user_id = p_user_id
     AND enrollment.term_key = 'current'
     AND enrollment.is_active = true
    WHERE course.provider = p_provider
      AND course.external_id = meeting_data->>'course_external_id'
    LIMIT 1;
    IF resolved_course_id IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.course_meetings (
      enrollment_user_id, course_id, external_id, weekday,
      starts_at, ends_at, room, location, source, updated_at
    ) VALUES (
      p_user_id,
      resolved_course_id,
      meeting_data->>'external_id',
      parsed_weekday,
      parsed_start,
      parsed_end,
      nullif(trim(meeting_data->>'room'), ''),
      nullif(trim(meeting_data->>'location'), ''),
      p_provider,
      now()
    );
    inserted_count := inserted_count + 1;
  END LOOP;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.academic_replace_meetings(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academic_replace_meetings(uuid, text, jsonb) TO service_role;
