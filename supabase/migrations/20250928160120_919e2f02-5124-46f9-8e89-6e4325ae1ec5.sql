-- Clean up stuck generating songs that are older than 10 minutes and will never complete
-- This handles songs that got stuck before the polling fixes were implemented

UPDATE public.songs 
SET 
  status = 'failed',
  updated_at = now()
WHERE 
  status = 'generating' 
  AND suno_id IS NULL 
  AND created_at < now() - INTERVAL '10 minutes';

-- Also update any songs that have been "generating" with a suno_id for over 30 minutes
-- (Suno API typically completes within 5-10 minutes, so 30 minutes is definitely stuck)
UPDATE public.songs 
SET 
  status = 'failed',
  updated_at = now()
WHERE 
  status = 'generating' 
  AND suno_id IS NOT NULL 
  AND created_at < now() - INTERVAL '30 minutes';