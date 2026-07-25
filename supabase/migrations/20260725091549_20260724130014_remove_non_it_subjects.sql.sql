/*
# Remove non-IT university-required courses from subjects

1. Purpose
   The `subjects` table was seeded with 80 courses across two majors
   (علم الحاسوب and الأمن السيبراني). Several of those are general
   university-required courses that are NOT core IT / Computer Science /
   Cybersecurity specialization courses — e.g. language skills, culture,
   national education, military science, life skills, volunteer work,
   and entrepreneurship.

   This migration deletes those non-IT rows so the platform only lists
   core IT specialization courses.

2. What gets deleted (by exact name, 12 rows total)
   - مهارات لغة عربية                        (CS)
   - مهارات اتصال باللغة الانجليزية           (CS)
   - مهارات اتصال باللغة الانجليزية (1)        (Cybersecurity)
   - مهارات اتصال باللغة العربية (1)           (Cybersecurity)
   - مهارات حاسوب                             (CS)
   - ثقافة اسلامية                            (Cybersecurity)
   - التربية الوطنية                          (Cybersecurity)
   - العلوم العسكرية                          (Cybersecurity)
   - القيادة والمسؤولية المجتمعية             (Cybersecurity)
   - عمل تطوعي في خدمة المجتمع                (Cybersecurity)
   - مهارات حياتية                            (Cybersecurity)
   - الريادة والابتكار                        (Cybersecurity)

3. Cascading effects
   - The `files` table references `subjects(id)` with ON DELETE CASCADE,
     so any files attached to these subjects are removed automatically.
     (These were seeded subjects with no user-uploaded files, so no real
     user data is lost.)

4. Idempotency
   - DELETE is naturally idempotent — re-running affects zero rows if
     the names no longer exist.

5. Security
   - No policy or schema changes.
*/

DELETE FROM public.subjects
WHERE name IN (
  'مهارات لغة عربية',
  'مهارات اتصال باللغة الانجليزية',
  'مهارات اتصال باللغة الانجليزية (1)',
  'مهارات اتصال باللغة العربية (1)',
  'مهارات حاسوب',
  'ثقافة اسلامية',
  'التربية الوطنية',
  'العلوم العسكرية',
  'القيادة والمسؤولية المجتمعية',
  'عمل تطوعي في خدمة المجتمع',
  'مهارات حياتية',
  'الريادة والابتكار'
);