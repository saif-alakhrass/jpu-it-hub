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

The database migration is in `supabase/migrations/`. The first user to sign up automatically becomes `admin`.

## Security

- Row-Level Security enabled on all tables
- Database triggers enforce the moderation rule (file status set by uploader role) — cannot be bypassed from the client
- Storage bucket scoped per-user
