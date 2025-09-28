-- Mark original song as resubmitted when a new resubmission is created
CREATE OR REPLACE FUNCTION public.handle_resubmission_initiated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.original_song_id IS NOT NULL THEN
    UPDATE public.songs
      SET resubmitted_at = COALESCE(resubmitted_at, now()),
          updated_at = now()
    WHERE id = NEW.original_song_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- Create trigger to run after inserting a new song (resubmission)
DROP TRIGGER IF EXISTS trg_handle_resubmission_initiated ON public.songs;
CREATE TRIGGER trg_handle_resubmission_initiated
AFTER INSERT ON public.songs
FOR EACH ROW
EXECUTE FUNCTION public.handle_resubmission_initiated();