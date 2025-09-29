-- Backfill existing library songs to be public
UPDATE public.songs 
SET is_public = true, updated_at = now()
WHERE requested_by IS NULL
  AND status = 'ready'
  AND url IS NOT NULL
  AND (is_public IS DISTINCT FROM true);