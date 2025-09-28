-- Fix the resubmission success trigger to only mark the immediate parent, not the whole chain
CREATE OR REPLACE FUNCTION public.handle_resubmission_success()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- When a song with original_song_id reaches 'ready' status, 
  -- mark ONLY the immediate parent song's resubmission as successful
  IF NEW.status = 'ready' AND OLD.status != 'ready' AND NEW.original_song_id IS NOT NULL THEN
    UPDATE public.songs 
    SET 
      resubmission_succeeded_at = now(),
      updated_at = now()
    WHERE id = NEW.original_song_id 
      AND resubmitted_at IS NOT NULL
      AND resubmission_succeeded_at IS NULL; -- Only update if not already marked
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Clean up the incorrectly marked song
UPDATE public.songs 
SET 
  resubmission_succeeded_at = NULL,
  updated_at = now()
WHERE id = '5880ad6d-9e82-4974-aa8a-98dfdb9d1629';