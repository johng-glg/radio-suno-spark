-- Update all existing songs to be library songs
UPDATE public.songs 
SET requested_by = NULL, updated_at = now()
WHERE requested_by IS NOT NULL;