/*
# Add development partner عبدالرحمن سريس to team_members

1. Purpose
   Insert "عبدالرحمن سريس" as a permanent entry in the `team_members`
   table so the About page fetches and renders him dynamically next to
   the founder (Saif Alakhrass).

2. Data
   - name:        عبدالرحمن سريس
   - role:        شريك التطوير والإشراف
   - image_url:   /abdullah-photo.jpg   (placeholder path; the About page
                  gracefully falls back to a default avatar icon when the
                  image file is absent, so this never breaks the UI)
   - bio:         شريك في تطوير وإشراف منصة JPU-IT Hub ومتابعة الخدمات الأكاديمية والتقنية.
   - sort_order:  1   (the founder is 0; the About page treats
                  sort_order = 1 as the "assistant" card shown beside
                  the founder, so عبدالرحمن renders next to Saif)

3. Idempotency
   - The team_members table has no unique constraint on `name`, so
     `ON CONFLICT` cannot be used. Instead the migration first deletes
     any existing row with the same name, then inserts the canonical
     record. Re-running is safe and will not create duplicates.

4. Security
   - No policy or schema changes. The public SELECT policy on
     team_members remains in effect, so the anon-key frontend can read
     this row.
*/

DELETE FROM public.team_members WHERE name = 'عبدالرحمن سريس';

INSERT INTO public.team_members (name, role, image_url, bio, sort_order)
VALUES (
  'عبدالرحمن سريس',
  'شريك التطوير والإشراف',
  '/abdullah-photo.jpg',
  'شريك في تطوير وإشراف منصة JPU-IT Hub ومتابعة الخدمات الأكاديمية والتقنية.',
  1
);