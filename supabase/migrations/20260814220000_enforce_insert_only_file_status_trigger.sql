/* Moderation must never be overwritten by the upload-status trigger. */

DROP TRIGGER IF EXISTS trg_set_file_status ON public.files;

CREATE TRIGGER trg_set_file_status
  BEFORE INSERT ON public.files
  FOR EACH ROW
  EXECUTE FUNCTION public.set_file_status();
