/* Remove the abandoned user-banning feature from environments where it ran. */

DROP TRIGGER IF EXISTS trg_prevent_banned_user_signup ON auth.users;
DROP FUNCTION IF EXISTS public.prevent_banned_user_signup();
DROP FUNCTION IF EXISTS public.ban_user(uuid, text, int, text);
DROP FUNCTION IF EXISTS public.unban_user_by_email(text);

-- No account should remain blocked by a feature that no longer exists.
UPDATE auth.users
SET banned_until = NULL
WHERE banned_until IS NOT NULL;

DROP TABLE IF EXISTS public.banned_identities;
