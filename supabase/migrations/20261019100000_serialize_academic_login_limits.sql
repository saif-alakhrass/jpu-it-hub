/*
  Serialize attempts for the same rate-limit key. The original row lock could
  not lock a row before its first insert, so concurrent first attempts could
  create separate timestamped windows and bypass the intended limit.
*/

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
  IF p_key_hash IS NULL OR length(p_key_hash) < 32
     OR p_limit < 1 OR p_window_seconds < 1 THEN
    RETURN false;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_key_hash, 0));

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

REVOKE ALL ON FUNCTION public.academic_check_login_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academic_check_login_rate_limit(text, integer, integer)
  TO service_role;
