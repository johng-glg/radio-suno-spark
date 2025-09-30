-- Update all existing songs to have lowercase genre, mood, and holiday values
UPDATE public.songs
SET 
  genre = LOWER(genre),
  mood = LOWER(mood),
  holiday = LOWER(holiday),
  updated_at = now()
WHERE 
  genre IS NOT NULL 
  OR mood IS NOT NULL 
  OR holiday IS NOT NULL;