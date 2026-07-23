/*
# Add subject code column and seed CS + Cybersecurity subjects

1. Overview
   This migration adds a `code` column to the `subjects` table to store the official
   university course code (e.g. 1001108). It also makes `created_by` nullable so that
   system-seeded subjects can have a NULL creator. Finally, it pre-populates all
   approved subjects for the two available majors:
   - علم الحاسوب (Computer Science): 39 subjects
   - الأمن السيبراني (Cybersecurity): 41 subjects

2. Schema Changes
   - subjects.code        text (new, nullable) — official university course code
   - subjects.created_by  altered to be nullable (system-seeded subjects have no human creator)

3. Data
   - 80 subject rows inserted with major, name, and code.
   - Uses ON CONFLICT (name, major) DO NOTHING to be idempotent — re-running won't duplicate.

4. Security
   - No policy changes. Existing RLS policies remain in effect.
   - subjects SELECT is already public (anon + authenticated).

5. Important Notes
   - The migration is idempotent: safe to re-run.
   - Seeded subjects have created_by = NULL (system subjects, not user-created).
   - The UNIQUE constraint on (name, major) prevents duplicate seeding.
*/

-- ---------- add code column ----------
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS code text;

-- ---------- make created_by nullable for system-seeded subjects ----------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subjects' AND column_name = 'created_by' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE subjects ALTER COLUMN created_by DROP NOT NULL;
  END IF;
END $$;

-- ---------- add unique constraint to prevent duplicate seeding ----------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subjects_name_major_key'
  ) THEN
    ALTER TABLE subjects ADD CONSTRAINT subjects_name_major_key UNIQUE (name, major);
  END IF;
END $$;

-- ---------- seed Computer Science subjects (علم الحاسوب) ----------
INSERT INTO subjects (name, major, code, created_by)
VALUES
  ('مهارات لغة عربية', 'علم الحاسوب', '0102099', NULL),
  ('مهارات اتصال باللغة الانجليزية', 'علم الحاسوب', '0000112', NULL),
  ('مهارات حاسوب', 'علم الحاسوب', '1001099', NULL),
  ('مقدمة في لغات البرمجة', 'علم الحاسوب', '1001108', NULL),
  ('أساسيات البرمجة', 'علم الحاسوب', '1001130', NULL),
  ('البرمجة الكينونية', 'علم الحاسوب', '1001131', NULL),
  ('لغة برمجة مختارة', 'علم الحاسوب', '1001330', NULL),
  ('البرمجة المتقدمة', 'علم الحاسوب', '1001328', NULL),
  ('البرمجة الكينونية المتقدمة', 'علم الحاسوب', '1001329', NULL),
  ('الرسم بالحاسوب', 'علم الحاسوب', '1001460', NULL),
  ('النظم الموزعة والسحابية', 'علم الحاسوب', '1001461', NULL),
  ('مقدمة في برمجة الانترنت', 'علم الحاسوب', '1001132', NULL),
  ('وسائط متعددة', 'علم الحاسوب', '1001314', NULL),
  ('الجبر الخطى باستخدام الحاسوب', 'علم الحاسوب', '1001118', NULL),
  ('رياضيات متقطعة', 'علم الحاسوب', '1001119', NULL),
  ('مبادئ في الاحصاء', 'علم الحاسوب', '0303211', NULL),
  ('تحليل عددي', 'علم الحاسوب', '0303321', NULL),
  ('بحوث العمليات', 'علم الحاسوب', '1001320', NULL),
  ('نظرية الاحتساب', 'علم الحاسوب', '1001224', NULL),
  ('تراكيب البيانات وتنظيم الملفات', 'علم الحاسوب', '1001220', NULL),
  ('تحليل وتصميم الخوارزميات', 'علم الحاسوب', '1001223', NULL),
  ('الذكاء الاصطناعي', 'علم الحاسوب', '1001310', NULL),
  ('نظم استرجاع البيانات', 'علم الحاسوب', '1001243', NULL),
  ('نماذج المحاكاة', 'علم الحاسوب', '1001471', NULL),
  ('تصميم المنطق الرقمي', 'علم الحاسوب', '1001109', NULL),
  ('تصميم وتنظيم الحاسوب', 'علم الحاسوب', '1001111', NULL),
  ('شبكات الحاسوب', 'علم الحاسوب', '100251', NULL),
  ('شبكات الحاسوب المتقدمة', 'علم الحاسوب', '1003351', NULL),
  ('امن المعلومات', 'علم الحاسوب', '1003361', NULL),
  ('قواعد البيانات', 'علم الحاسوب', '1001140', NULL),
  ('قواعد البيانات المتقدمة', 'علم الحاسوب', '1001342', NULL),
  ('معمارية الحاسوب', 'علم الحاسوب', '1001210', NULL),
  ('نظم التشغيل', 'علم الحاسوب', '1001410', NULL),
  ('البرمجة المرئية', 'علم الحاسوب', '1001230', NULL),
  ('برمجة تطبيقات الانترنت', 'علم الحاسوب', '1001233', NULL),
  ('تحليل وتصميم النظم', 'علم الحاسوب', '1001225', NULL),
  ('هندسة البرمجيات', 'علم الحاسوب', '1001432', NULL),
  ('تفاعل الانسان مع الحاسوب', 'علم الحاسوب', '1001393', NULL)
ON CONFLICT (name, major) DO NOTHING;

-- ---------- seed Cybersecurity subjects (الأمن السيبراني) ----------
INSERT INTO subjects (name, major, code, created_by)
VALUES
  ('مهارات اتصال باللغة العربية (1)', 'الأمن السيبراني', '0000110', NULL),
  ('مهارات اتصال باللغة الانجليزية (1)', 'الأمن السيبراني', '0000112', NULL),
  ('ثقافة اسلامية', 'الأمن السيبراني', '0000120', NULL),
  ('مقدمة في لغات البرمجة', 'الأمن السيبراني', '1001108', NULL),
  ('أساسيات البرمجة', 'الأمن السيبراني', '1001130', NULL),
  ('الجبر الخطى باستخدام الحاسوب', 'الأمن السيبراني', '1001118', NULL),
  ('مقدمة في برمجة الانترنت', 'الأمن السيبراني', '1002130', NULL),
  ('مبادئ الأمن السيبراني', 'الأمن السيبراني', '1004161', NULL),
  ('التربية الوطنية', 'الأمن السيبراني', '0000113', NULL),
  ('رياضيات متقطعة', 'الأمن السيبراني', '1001119', NULL),
  ('قواعد البيانات', 'الأمن السيبراني', '1002140', NULL),
  ('شبكات الحاسوب', 'الأمن السيبراني', '1003251', NULL),
  ('أمن البرمجيات', 'الأمن السيبراني', '1004261', NULL),
  ('البرمجة الكينونية', 'الأمن السيبراني', '1001131', NULL),
  ('تراكيب البيانات وتنظيم الملفات', 'الأمن السيبراني', '1001220', NULL),
  ('أمن البنية التحتية باستخدام لينكس', 'الأمن السيبراني', '1004262', NULL),
  ('شبكات الحاسوب المتقدمة', 'الأمن السيبراني', '1003351', NULL),
  ('البرمجة المرئية', 'الأمن السيبراني', '1001230', NULL),
  ('الشبكات اللاسلكية', 'الأمن السيبراني', '1003350', NULL),
  ('أمن المعلومات', 'الأمن السيبراني', '1003361', NULL),
  ('بروتوكولات الاتصال الآمنة', 'الأمن السيبراني', '1004363', NULL),
  ('تحليل وتصميم الخوارزميات', 'الأمن السيبراني', '1001223', NULL),
  ('تحليل عددي (1)', 'الأمن السيبراني', '0303321', NULL),
  ('برمجة تطبيقات الانترنت', 'الأمن السيبراني', '1001233', NULL),
  ('أمن الشبكات', 'الأمن السيبراني', '1003362', NULL),
  ('الذكاء الاصطناعي', 'الأمن السيبراني', '1001310', NULL),
  ('مبادئ في الإحصاء', 'الأمن السيبراني', '0303211', NULL),
  ('نظم التشغيل', 'الأمن السيبراني', '1001410', NULL),
  ('القيادة والمسؤولية المجتمعية', 'الأمن السيبراني', '0000148', NULL),
  ('تحليلات البيانات', 'الأمن السيبراني', '1004462', NULL),
  ('أمن التجارة الإلكترونية', 'الأمن السيبراني', '1003460', NULL),
  ('برمجة متخصصة بالأمن السيبراني', 'الأمن السيبراني', '1004463', NULL),
  ('مشروع التخرج 1', 'الأمن السيبراني', '1004482', NULL),
  ('تدريب ميداني', 'الأمن السيبراني', '1004315', NULL),
  ('مهارات حياتية', 'الأمن السيبراني', '0000149', NULL),
  ('العلوم العسكرية', 'الأمن السيبراني', '0000100', NULL),
  ('عمل تطوعي في خدمة المجتمع', 'الأمن السيبراني', '0000105', NULL),
  ('مقدمة إلى الأدلة الجنائية الرقمية', 'الأمن السيبراني', '1004472', NULL),
  ('توثيق وتقييم الشبكات', 'الأمن السيبراني', '1003461', NULL),
  ('السلامة والمصادقة للبيانات', 'الأمن السيبراني', '1004464', NULL),
  ('مشروع التخرج 2', 'الأمن السيبراني', '1004483', NULL),
  ('الريادة والابتكار', 'الأمن السيبراني', '0000147', NULL)
ON CONFLICT (name, major) DO NOTHING;
