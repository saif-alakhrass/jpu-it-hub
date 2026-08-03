# JPU-IT Hub | جامعة جرش - كلية الـ IT

A full-stack academic resource-sharing platform for Jerash University's IT Faculty, built with React, TypeScript, Vite, Tailwind CSS, Supabase, and Cloudflare R2.

## Features

- **Authentication & Roles** — Email/password + Google login via Supabase Auth
  - `admin` — full control, owner
  - `trusted` — uploads publish instantly
  - `student` — default role, uploads require admin approval
- **Subjects** — searchable, filterable by IT major, anyone can browse; login required to create
- **Resource Tabs** — each subject organizes files into:
  - تلاخيص وشروحات (Summaries & Notes)
  - امتحانات وسنوات سابقة (Past Exams)
  - صور ومسودات (Images & Drafts)
  - سلايدات وكتب (Slides & Books)
- **Moderation System**
  - Trusted/admin uploads → `approved` (published instantly)
  - Student uploads → `pending` (hidden, shows "قيد المراجعة" badge to uploader)
  - Admin dashboard at `/admin`: review pending files with preview, one-click approve/reject, promote students to trusted
- **Dual Storage** — Files are stored in Cloudflare R2 (new uploads) or Supabase Storage (legacy), with seamless backward compatibility
- **UI** — Arabic RTL, sleek dark theme, responsive, animations

## Tech Stack

- React 18 + TypeScript + Vite
- Tailwind CSS (custom dark theme)
- Supabase (Auth, Database with RLS)
- Cloudflare R2 (file storage via Cloudflare Worker proxy)
- lucide-react icons

## Architecture

```
Frontend (Vercel)          Cloudflare Worker           Cloudflare R2
  ┌──────────┐    JWT      ┌──────────────┐    S3 API   ┌───────────┐
  │  React   │ ──────────> │  Worker      │ ─────────> │  R2 Bucket │
  │  App     │ <────────── │  (presign)   │ <───────── │  (private) │
  └──────────┘  presigned  └──────────────┘            └───────────┘
       │                        │
       │    Supabase JS          │  Service Role Key
       v                        v
  ┌──────────┐            ┌──────────────┐
  │ Supabase │            │  Supabase    │
  │  Auth    │            │  Database    │
  │  + DB    │            │  (REST API)  │
  └──────────┘            └──────────────┘
```

- The **frontend** talks to Supabase for Auth and database queries (with RLS).
- The **Cloudflare Worker** is the only component with R2 credentials. It verifies the Supabase JWT on every request, issues short-lived presigned URLs, and manages file lifecycle.
- **R2** is fully private — no public bucket, no r2.dev URLs.
- The **database** stores only `object_key`, never signed URLs.

## Setup

### 1. Frontend

1. Clone the repo
2. Copy `.env.example` to `.env` and fill in:
   - `VITE_SUPABASE_URL` — your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — your Supabase anon key
   - `VITE_R2_WORKER_URL` — your deployed Cloudflare Worker URL
3. `npm install`
4. `npm run dev`

### 2. Database

For a new Supabase project, run `supabase/migrations/schema.sql` once, then run the timestamped migrations in ascending order. The R2 migration (`20260803120000_add_r2_storage_columns.sql`) adds `storage_provider`, `object_key`, `file_hash`, and `mime_type` columns.

For an existing project, apply only timestamped migrations that have not already been recorded. Back up production data before any database migration.

New users get the `student` role automatically; admins are **never** assigned automatically. To grant admin access:

```sql
UPDATE profiles SET role = 'admin' WHERE id = '<user-uuid>';
```

### 3. Cloudflare R2 + Worker

#### Create the R2 bucket

1. Log in to the [Cloudflare dashboard](https://dash.cloudflare.com).
2. Go to **R2 Object Storage** → **Create bucket**.
3. Name it `jpu-it-hub-files` (or update `bucket_name` in `worker/wrangler.toml`).
4. **Do NOT enable public access** — the bucket must remain private.
5. Do NOT enable `r2.dev` subdomain — no public URLs.

#### Create R2 API tokens

1. Go to **R2** → **Manage R2 API Tokens** → **Create API Token**.
2. Permissions: **Object Read & Write**.
3. Specify the bucket `jpu-it-hub-files`.
4. Copy the **Access Key ID**, **Secret Access Key**, and **Account ID**.

#### Deploy the Worker

```bash
cd worker
npm install

# Set secrets (you will be prompted to paste each value — never commit these)
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put JWT_SECRET
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler secret put R2_ACCOUNT_ID

# Deploy
npx wrangler deploy
```

#### What each secret is

| Secret | Description | Where to find it |
|--------|-------------|------------------|
| `SUPABASE_URL` | Your Supabase project URL | Supabase dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only, never in frontend) | Supabase dashboard → Settings → API |
| `JWT_SECRET` | Your Supabase project's JWT secret | Supabase dashboard → Settings → API → JWT Settings |
| `R2_ACCESS_KEY_ID` | R2 API token access key | Cloudflare dashboard → R2 → Manage API Tokens |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret key | Cloudflare dashboard → R2 → Manage API Tokens |
| `R2_ACCOUNT_ID` | Your Cloudflare account ID | Cloudflare dashboard → right sidebar |

#### Update CORS origins

Edit `worker/wrangler.toml` → `CORS_ALLOWED_ORIGINS` to include your production and preview URLs.

### 4. Vercel environment variables

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | `https://your-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | your Supabase anon key |
| `VITE_R2_WORKER_URL` | `https://jpu-it-hub-storage.your-subdomain.workers.dev` |

Do NOT set `SUPABASE_SERVICE_ROLE_KEY` or any R2 secrets in Vercel — those live only in the Cloudflare Worker.

## Security

- Row-Level Security enabled on all tables
- Database triggers enforce the moderation rule (file status set by uploader role)
- The `role` column on `profiles` is protected by a database trigger
- **R2 bucket is fully private** — no public access, no r2.dev URLs
- **R2 credentials never touch the frontend** — only the Cloudflare Worker has them
- **Supabase JWT verified on every Worker request** — upload, download, and delete
- **File type validated at three layers**: frontend, Worker (magic bytes), database (CHECK constraint)
- **Path traversal protection**: object keys validated as `{uuid}/{uuid}.{ext}` at Worker and DB level
- **Rate limiting**: 5 files per user per 10-minute window (in-memory + database trigger)
- **Deduplication**: SHA-256 hash prevents identical files within the same subject
- **Signed URLs**: short-lived (5 minutes), never stored in the database
- **Rollback safety**: if DB save fails after R2 upload, the R2 object is deleted; if R2 delete fails, cleanup is queued

## Quality checks

### Frontend

```bash
npm ci
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm audit --omit=dev --audit-level=critical
```

### Worker

```bash
cd worker
npm install
npm run typecheck
npm test
```

## Migrating legacy files from Supabase Storage to R2

A separate migration script is provided at `scripts/migrate-supabase-to-r2.ts`. Run it manually after verifying the R2 setup works. It does NOT delete the Supabase Storage objects.

## Rollback plan

If the R2 integration needs to be reverted:

1. **Frontend**: Remove `VITE_R2_WORKER_URL` from Vercel env vars. The app will automatically fall back to Supabase Storage.
2. **Database**: The new columns are nullable and default to `'supabase'`. No data loss.
3. **Worker**: Delete the Cloudflare Worker and R2 bucket after confirming no new uploads reference R2.
4. **New uploads**: Without the Worker URL, the frontend automatically uses the Supabase Storage upload path.

No database rollback migration is needed — the new columns are additive and nullable.
