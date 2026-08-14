/*
  Admin moderation details + lightweight in-app notifications.

  Notifications are stored once for public summary announcements (recipient_id
  is NULL) and per recipient for private moderation messages. This avoids a
  write per student when a new summary is approved.
*/

ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'files_rejection_reason_check'
      AND conrelid = 'public.files'::regclass
  ) THEN
    ALTER TABLE public.files
      ADD CONSTRAINT files_rejection_reason_check
      CHECK (rejection_reason IS NULL OR char_length(btrim(rejection_reason)) BETWEEN 3 AND 500);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('file_approved', 'file_rejected', 'file_updated', 'new_summary')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 600),
  subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE,
  file_id uuid REFERENCES public.files(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_broadcast_only_for_summaries CHECK (recipient_id IS NOT NULL OR type = 'new_summary')
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created ON public.notifications(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON public.notifications(recipient_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_broadcast_created ON public.notifications(created_at DESC) WHERE recipient_id IS NULL;

DROP POLICY IF EXISTS notifications_select_visible ON public.notifications;
CREATE POLICY notifications_select_visible ON public.notifications FOR SELECT TO authenticated USING (recipient_id = auth.uid() OR recipient_id IS NULL);
DROP POLICY IF EXISTS notifications_mark_own_read ON public.notifications;
CREATE POLICY notifications_mark_own_read ON public.notifications FOR UPDATE TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

CREATE OR REPLACE FUNCTION public.create_file_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  subject_name text;
  file_name text;
BEGIN
  SELECT name INTO subject_name FROM public.subjects WHERE id = NEW.subject_id;
  file_name := NEW.title;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
        INSERT INTO public.notifications (recipient_id, type, title, message, subject_id, file_id)
        VALUES (NEW.uploader_id, 'file_approved', 'تم قبول ملفك', format('تمت مراجعة "%s" ونشره في مادة %s.', file_name, coalesce(subject_name, 'المادة')), NEW.subject_id, NEW.id);
      ELSIF NEW.status = 'rejected' THEN
        INSERT INTO public.notifications (recipient_id, type, title, message, subject_id, file_id)
        VALUES (NEW.uploader_id, 'file_rejected', 'تم رفض ملفك', format('تم رفض "%s". السبب: %s', file_name, coalesce(NEW.rejection_reason, 'لم يتم تحديد سبب.')), NEW.subject_id, NEW.id);
      END IF;
    END IF;
    IF OLD.title IS DISTINCT FROM NEW.title OR OLD.tab IS DISTINCT FROM NEW.tab OR OLD.subject_id IS DISTINCT FROM NEW.subject_id THEN
      INSERT INTO public.notifications (recipient_id, type, title, message, subject_id, file_id)
      VALUES (NEW.uploader_id, 'file_updated', 'تم تنظيم ملفك', format('قام المدير بتحديث اسم أو مكان الملف "%s" في مادة %s.', file_name, coalesce(subject_name, 'المادة')), NEW.subject_id, NEW.id);
    END IF;
  END IF;

  IF NEW.status = 'approved' AND NEW.tab = 'summaries' AND (TG_OP = 'INSERT' OR OLD.status = 'pending') THEN
    INSERT INTO public.notifications (recipient_id, type, title, message, subject_id, file_id)
    VALUES (NULL, 'new_summary', 'تمت إضافة ملخص جديد', format('أُضيف "%s" إلى مادة %s.', file_name, coalesce(subject_name, 'المادة')), NEW.subject_id, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_file_notifications ON public.files;
CREATE TRIGGER trg_create_file_notifications AFTER INSERT OR UPDATE OF status, title, tab, subject_id ON public.files FOR EACH ROW EXECUTE FUNCTION public.create_file_notifications();
REVOKE ALL ON FUNCTION public.create_file_notifications() FROM PUBLIC, anon, authenticated;
