/*
# Multi-department subjects (deduplication) + academic profile fields

1. Overview
   (A) Subjects gain a `departments` text[] array for multi-department membership;
       duplicate subjects shared between CS and Cybersecurity are merged into one row.
   (B) Profiles gain academic-detail columns for the User Profile page.

2. Schema Changes — subjects
   - `departments` (text[], NOT NULL, default empty array)
   - `major` retained for backward compatibility; `departments` is source of truth.
   - UNIQUE(name, major) dropped; UNIQUE(name) added so shared subjects exist once.

3. Data Migration — dedup
   - Names normalized: 'امن المعلومات' → 'أمن المعلومات', 'مبادئ في الاحصاء' → 'مبادئ في الإحصاء',
     'تحليل عددي (1)' → 'تحليل عددي'. Renames only applied when no target row exists yet
     (avoids violating UNIQUE(name) when both spellings are present).
   - For each duplicate-name group, the oldest row is kept; its departments array is
     set to all majors in the group; files re-pointed to the keeper; duplicates deleted.
   - After merging, each subject name is unique.

4. Schema Changes — profiles
   - academic_year (text), department (text), credit_hours (int), bio (text) — all nullable.

5. Security — no policy changes (existing profiles update + subjects select policies cover this).
6. Idempotency — all guarded; re-running is safe.
*/

ALTER TABLE subjects ADD COLUMN IF NOT EXISTS departments text[] NOT NULL DEFAULT ARRAY[]::text[];

UPDATE subjects
SET departments = ARRAY[major]
WHERE departments = ARRAY[]::text[];

-- Normalize names ONLY when the target name does not already exist, so we never
-- violate UNIQUE(name) by creating two rows with the same name.
UPDATE subjects SET name = 'أمن المعلومات'
WHERE name = 'امن المعلومات'
  AND NOT EXISTS (SELECT 1 FROM subjects s2 WHERE s2.name = 'أمن المعلومات' AND s2.id <> subjects.id);

UPDATE subjects SET name = 'مبادئ في الإحصاء'
WHERE name = 'مبادئ في الاحصاء'
  AND NOT EXISTS (SELECT 1 FROM subjects s2 WHERE s2.name = 'مبادئ في الإحصاء' AND s2.id <> subjects.id);

UPDATE subjects SET name = 'تحليل عددي'
WHERE name = 'تحليل عددي (1)'
  AND NOT EXISTS (SELECT 1 FROM subjects s2 WHERE s2.name = 'تحليل عددي' AND s2.id <> subjects.id);

-- Merge any remaining duplicate-name groups: keep oldest row, aggregate departments,
-- re-point files, delete duplicates.
DO $$
DECLARE
  dup_name text;
  keeper_id uuid;
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