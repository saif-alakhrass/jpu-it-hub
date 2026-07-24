/*
# Remove stale assistant row from team_members

1. Purpose
   A pre-existing row with name "سريس" and role "مساعد المطور" was
   superseded by the properly-named "عبدالرحمن سريس" entry added in the
   previous migration. Both had sort_order = 1, so the About page could
   non-deterministically pick the wrong one as the assistant card.

   This migration deletes the stale "سريس" row so only the canonical
   "عبدالرحمن سريس" (شريك التطوير والإشراف) remains at sort_order 1,
   rendering correctly next to the founder.

2. Idempotency
   - DELETE is naturally idempotent.

3. Security
   - No policy or schema changes.
*/

DELETE FROM public.team_members WHERE name = 'سريس';
