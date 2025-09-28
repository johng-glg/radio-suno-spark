-- Add original_song_id field to track resubmissions
ALTER TABLE public.songs 
ADD COLUMN original_song_id UUID REFERENCES public.songs(id);

-- Create index for performance on the new field
CREATE INDEX idx_songs_original_song_id ON public.songs(original_song_id);

-- Add new status values for better tracking
-- Update the status check constraint to include new statuses
-- Note: We'll handle this through application logic instead of constraints

-- Create a function to update original song when resubmission succeeds
CREATE OR REPLACE FUNCTION public.handle_resubmission_success()
RETURNS TRIGGER AS $$
BEGIN
  -- When a song with original_song_id reaches 'ready' status, 
  -- update the original song to mark resubmission as successful
  IF NEW.status = 'ready' AND OLD.status != 'ready' AND NEW.original_song_id IS NOT NULL THEN
    UPDATE public.songs 
    SET 
      status = 'resubmission_succeeded',
      updated_at = now()
    WHERE id = NEW.original_song_id 
      AND status = 'resubmitted';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to automatically update original songs when resubmissions succeed
CREATE TRIGGER trigger_resubmission_success
  AFTER UPDATE ON public.songs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_resubmission_success();