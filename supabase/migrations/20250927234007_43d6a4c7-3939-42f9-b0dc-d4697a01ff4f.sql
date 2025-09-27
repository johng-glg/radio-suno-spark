-- Allow songs to be marked as failed by updating the status check constraint
ALTER TABLE public.songs DROP CONSTRAINT IF EXISTS songs_status_check;
ALTER TABLE public.songs
  ADD CONSTRAINT songs_status_check
  CHECK (status IN ('generating', 'ready', 'playing', 'finished', 'failed'));
