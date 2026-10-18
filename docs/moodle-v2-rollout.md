# Moodle V2 rollout

The Moodle integration was validated in an isolated Supabase, Cloudflare
Worker, and Vercel staging environment before the production rollout.

## Required Worker configuration

Non-secret variables:

- `ACADEMIC_AUTH_ENABLED=true`
- `MOODLE_BASE_URL=https://www.jpu.edu.jo/lms`
- `MOODLE_SERVICE_NAME=moodle_mobile_app` (or the approved read-only service)

Existing Worker secrets remain required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- storage/JWT secrets already used by the project

Never add a Moodle username, password, or user token to environment variables,
logs, analytics, database rows, or error reports.

The public compatibility probe on 2026-10-18 confirmed that
`https://www.jpu.edu.jo/lms/login/token.php` is live and responds with Moodle's
structured token API. The previously suggested `moodle.jpu.edu.jo` hostname
does not currently resolve and must not be used.

## Staging sequence

1. Create a new Supabase staging project and apply all migrations in order.
2. Create a separate Worker environment and R2 staging bucket/prefix.
3. Set the Moodle URL and enable academic auth only in the staging Worker.
4. Set `VITE_MOODLE_AUTH_ENABLED=true` only in the Vercel preview environment.
5. Verify with an approved test account that Moodle exposes:
   `core_webservice_get_site_info` and `core_enrol_get_users_courses`.
   `core_user_get_users_by_field` is strongly recommended so existing
   non-admin accounts can be matched by their verified university email.
6. Pilot with test accounts before applying the migration to production.
7. While old login is still active, explicitly pre-link every admin account
   through authenticated `POST /v2/auth/moodle/link`. Admin accounts are never
   linked from a Moodle email match, which prevents external identity data from
   granting elevated authority.

## Login contract

`POST /v2/auth/moodle` accepts the student ID and Moodle password over HTTPS.
The Worker verifies them with the fixed Moodle host, fetches the profile and
current courses, commits one idempotent sync transaction, and returns a
single-use Supabase token hash. The browser exchanges that hash for the normal
Supabase session used by the existing RLS policies.

The Moodle password and Moodle token are intentionally never persisted. A new
login performs a new automatic sync. Official academic tables have read-only
RLS for the owner; only the Worker service role can write them.

## Rollback

Turning both feature flags back to `false` restores the existing sign-in UI and
stops the Moodle endpoint without deleting users or modifying roles. V2 tables
are additive, so the production application can be rolled back independently.
