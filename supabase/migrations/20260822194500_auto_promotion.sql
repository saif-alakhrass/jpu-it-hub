-- Migration: Auto Promotion to Trusted for Students with 20+ Approved Files

-- Create a composite index to ensure the COUNT() query is highly optimized
CREATE INDEX IF NOT EXISTS idx_files_uploader_status ON public.files(uploader_id, status);

CREATE OR REPLACE FUNCTION public.check_auto_promotion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  approved_count int;
  uploader_role text;
BEGIN
  -- We only care when a file becomes approved.
  -- This handles both direct insertion of approved files (e.g. by admin on behalf of someone)
  -- and updates to pending files by an admin.
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved') OR 
     (TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status <> 'approved') THEN
     
     -- Lock the profile row for update to prevent race conditions during concurrent approvals
     SELECT role INTO uploader_role FROM public.profiles WHERE id = NEW.uploader_id FOR UPDATE;
     
     -- Only proceed if the user is a student. 
     -- We DO NOT touch trusted, admin, or super admin roles.
     IF uploader_role = 'student' THEN
        -- Count only uniquely approved files (not deleted, not pending, not rejected)
        SELECT count(*) INTO approved_count 
        FROM public.files 
        WHERE uploader_id = NEW.uploader_id AND status = 'approved';
        
        -- If they hit the threshold, promote them
        IF approved_count >= 20 THEN
           UPDATE public.profiles SET role = 'trusted' WHERE id = NEW.uploader_id;
        END IF;
     END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop trigger if exists to allow safe re-runs
DROP TRIGGER IF EXISTS trg_auto_promote_student ON public.files;

-- Attach the trigger to run AFTER the file status is committed
CREATE TRIGGER trg_auto_promote_student
AFTER INSERT OR UPDATE ON public.files
FOR EACH ROW
EXECUTE FUNCTION public.check_auto_promotion();
