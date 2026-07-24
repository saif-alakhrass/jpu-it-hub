/*
# Create team_members table for the About Us page

1. New Tables
- `team_members`
  - `id` (uuid, primary key, auto-generated)
  - `name` (text, not null) — display name of the team member
  - `role` (text, not null) — role/title (e.g. "مؤسس ومطور المنصة")
  - `image_url` (text, not null) — URL to the member's avatar/photo
  - `bio` (text, nullable) — short biography
  - `sort_order` (int, default 0) — manual ordering, lower comes first
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `team_members`.
- Public read access for anon + authenticated (the About page is visible to all visitors).
- No insert/update/delete policies via the anon key — management happens through the
  Supabase dashboard or an authenticated admin context.

3. Seed
- Inserts the founder "سيف الأخرس (Saif Alakhrass)" as the first record so the
  About page shows a founder card even before any manual data entry.
*/

CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL,
  image_url text NOT NULL,
  bio text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_team_members" ON public.team_members;
CREATE POLICY "public_read_team_members"
ON public.team_members FOR SELECT
TO anon, authenticated
USING (true);

-- Seed the founder record (idempotent: only insert if no rows exist)
INSERT INTO public.team_members (name, role, image_url, bio, sort_order)
SELECT
  'سيف الأخرس (Saif Alakhrass)',
  'مؤسس ومطور المنصة',
  '/my-photo.jpg',
  'مطور المنصة والمشرف على تطوير الأنظمة والخدمات الأكاديمية لطلاب الكلية.',
  0
WHERE NOT EXISTS (SELECT 1 FROM public.team_members LIMIT 1);
