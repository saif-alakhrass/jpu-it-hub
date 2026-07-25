/*
# Multi-department subjects (deduplication) + academic profile fields

1. Overview
   This migration implements two related changes:
   (A) Subjects now support multi-department membership via a `departments`
       text[] array, and duplicate subjects shared between Computer Science
       and Cybersecurity are merged into single entities.
   (B) Profiles gain academic-detail columns for the new User Profile page.

2. Schema Changes — subjects table
   - `departments` (text[], NOT NULL, default empty array) — list of
     department names this subject belongs to (e.g. ['علم الحاسوب','الأمن السيبراني']).
   - Existing `major` column is retained for backward compatibility; the new
     `departments` array is the source of truth going forward.
   - The old UNIQUE(name, major) constraint is dropped and replaced with
     UNIQUE(name) so shared subjects exist as a single row.

3. Data Migration — subject deduplication
   - Near-duplicate names are normalized first:
       'امن المعلومات'            → 'أمن المعلومات'
       'مبادئ في الاحصاء'         → 'مبادئ في الإحصاء'
       'تحليل عددي (1)'           → 'تحليل عددي'
   - For every group of rows sharing the same name across majors, the oldest
     row (by created_at) is kept as the "canonical" row. Its `departments`
     array is set to the aggregate of all majors in the group. Files attached
     to duplicate rows are re-pointed to the canonical row. Duplicates are
     then deleted (files cascade is not triggered because files are moved first).
   - After merging, each subject name is unique.

4. Schema Changes — profiles table
   - `academic_year`   (text, nullable) — e.g. 'السنة الأولى', 'الثانية'...
   - `department`      (text, nullable) — student's department / major
   - `credit_hours`    (int, nullable)  — completed credit hours
   - `bio`             (text, nullable) — personal bio

5. Security
   - No RLS policy changes. The existing profiles update policy
     ("profiles_update_self_or_admin") already allows each authenticated
     user to update their own row, which covers editing the new academic
     fields. The subjects SELECT policy remains public.

6. Idempotency
   - All statements use IF (NOT) EXISTS / guarded DO blocks.
   - The dedup DO block is a no-op when no duplicate names remain.
   - Re-running is safe.
*/

ALTER TABLE subjects ADD COLUMN IF NOT EXISTS departments text[] NOT NULL DEFAULT ARRAY[]::text[];

UPDATE subjects
SET departments = ARRAY[major]
WHERE departments = ARRAY[]::text[];

UPDATE subjects SET name = 'أمن المعلومات' WHERE name = 'امن المعلومات';
UPDATE subjects SET name = 'مبادئ في الإحصاء' WHERE name = 'مبادئ في الاحصاء';
UPDATE subjects SET name = 'تحليل عددي' WHERE name = 'تحليل عددي (1)';

DO $$
DECLARE
  dup_name text;
  keeper_id uuid;
  dup_id uuid;
  all_depts text[];
BEGIN
  FOR dup_name IN
    SELECT name FROM subjects GROUP BY name HAVING count(*) > 1
  LOOP
    SELECT id INTO keeper_id
    FROM subjects WHERE name = dup_name
    ORDER BY created_at ASC, id ASC LIMIT 1;

    SELECT array_agg(DISTINCT major) INTO all_depts
    FROM subjects WHERE name = dup_name;

    UPDATE subjects SET departments = all_depts WHERE id = keeper_id;

    UPDATE files SET subject_id = keeper_id
    WHERE subject_id IN (
      SELECT id FROM subjects WHERE name = dup_name AND id <> keeper_id
    );

    DELETE FROM subjects WHERE name = dup_name AND id <> keeper_id;
  END LOOP;
END $$;

ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_name_major_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subjects_name_key') THEN
    ALTER TABLE subjects ADD CONSTRAINT subjects_name_key UNIQUE (name);
  END IF;
END $$;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS academic_year text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credit_hours int;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio text;
