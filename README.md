# JPU-IT Hub | جامعة جرش - كلية الـ IT

A full-stack academic resource-sharing platform for Jerash University's IT Faculty, built with React, TypeScript, Vite, Tailwind CSS, and Supabase.

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
- **UI** — Arabic RTL, sleek dark theme, responsive, animations

## Tech Stack

- React 18 + TypeScript + Vite
- Tailwind CSS (custom dark theme)
- Supabase (Auth, Database with RLS, Storage)
- lucide-react icons

## Setup

1. Clone the repo
2. Copy `.env.example` to `.env` and fill in your Supabase URL and anon key
3. `npm install`
4. `npm run dev`

### Database setup

For a new Supabase project, run `supabase/migrations/schema.sql` once, then run
the timestamped migrations in ascending order. The final hardening migration is
idempotent and must be included: it creates `file_batches`, links files to their
batches, enables RLS, keeps batch state synchronized, and forces the `files`
bucket to remain private.

For an existing project, apply only timestamped migrations that have not
already been recorded in that environment. Back up production data before any
database migration.

The database migration is in `supabase/migrations/`. New users get the `student` role automatically; admins are **never** assigned automatically. To grant admin access, run this SQL once in the Supabase dashboard (SQL Editor):

```sql
UPDATE profiles SET role = 'admin' WHERE id = '<user-uuid>';
```

Or grant it from the Supabase dashboard's Table Editor.

## Security

- Row-Level Security enabled on all tables
- Database triggers enforce the moderation rule (file status set by uploader role) — cannot be bypassed from the client
- The `role` column on `profiles` is protected by a database trigger: only admins can change user roles (students/trusted users cannot self-promote)
- File storage bucket is **private** — files are served via time-limited signed URLs, not public URLs, so unapproved uploads cannot be guessed or accessed
- Upload rate limit: maximum 5 files per user per 10-minute window (enforced at the database level)

## Quality checks

Run the same checks used by GitHub Actions before opening a pull request:

```bash
npm ci
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm audit --omit=dev --audit-level=critical
```
