-- Moderation changes (approve/reject/restore) must preserve the status chosen
-- by an administrator. The upload validation trigger is only needed for new
-- rows; running it on UPDATE was overwriting rejected files back to pending or
-- approved according to the uploader's role.

DROP TRIGGER IF EXISTS trg_set_file_status ON public.files;

CREATE TRIGGER trg_set_file_status
  BEFORE INSERT ON public.files
  FOR EACH ROW
  EXECUTE FUNCTION public.set_file_status();
