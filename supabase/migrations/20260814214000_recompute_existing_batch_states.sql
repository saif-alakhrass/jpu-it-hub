/* Restore the folder-state trigger, then reconcile folders created before it existed. */

CREATE OR REPLACE FUNCTION public.recompute_file_batch_state(target_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_count integer;
  approved_count integer;
  rejected_count integer;
  next_status text;
BEGIN
  IF target_batch_id IS NULL THEN RETURN; END IF;

  SELECT count(*)::integer,
         count(*) FILTER (WHERE status = 'approved')::integer,
         count(*) FILTER (WHERE status = 'rejected')::integer
    INTO total_count, approved_count, rejected_count
    FROM public.files WHERE batch_id = target_batch_id;

  IF total_count = 0 THEN
    DELETE FROM public.file_batches WHERE id = target_batch_id;
    RETURN;
  END IF;

  next_status := CASE
    WHEN approved_count = total_count THEN 'approved'
    WHEN rejected_count = total_count THEN 'rejected'
    ELSE 'pending'
  END;
  UPDATE public.file_batches SET file_count = total_count, status = next_status WHERE id = target_batch_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_file_batch_after_file_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_file_batch_state(OLD.batch_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.batch_id IS DISTINCT FROM NEW.batch_id THEN
    PERFORM public.recompute_file_batch_state(OLD.batch_id);
  END IF;
  PERFORM public.recompute_file_batch_state(NEW.batch_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_file_batch_after_file_change ON public.files;
CREATE TRIGGER trg_sync_file_batch_after_file_change
  AFTER INSERT OR DELETE OR UPDATE OF status, batch_id ON public.files
  FOR EACH ROW EXECUTE FUNCTION public.sync_file_batch_after_file_change();

REVOKE ALL ON FUNCTION public.recompute_file_batch_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_file_batch_after_file_change() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  batch_record record;
BEGIN
  FOR batch_record IN SELECT id FROM public.file_batches LOOP
    PERFORM public.recompute_file_batch_state(batch_record.id);
  END LOOP;
END;
$$;
