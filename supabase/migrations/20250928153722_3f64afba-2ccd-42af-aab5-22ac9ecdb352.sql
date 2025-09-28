-- Add resubmission tracking columns to preserve failure statistics
ALTER TABLE public.songs 
ADD COLUMN resubmitted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN resubmission_succeeded_at TIMESTAMP WITH TIME ZONE;

-- Update the trigger to track resubmission success without changing original status
CREATE OR REPLACE FUNCTION public.handle_resubmission_success()
RETURNS TRIGGER AS $$
BEGIN
  -- When a song with original_song_id reaches 'ready' status, 
  -- mark the original song's resubmission as successful (but keep original status as failed)
  IF NEW.status = 'ready' AND OLD.status != 'ready' AND NEW.original_song_id IS NOT NULL THEN
    UPDATE public.songs 
    SET 
      resubmission_succeeded_at = now(),
      updated_at = now()
    WHERE id = NEW.original_song_id 
      AND resubmitted_at IS NOT NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;