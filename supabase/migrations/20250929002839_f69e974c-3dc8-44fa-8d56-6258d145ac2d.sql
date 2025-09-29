-- Fix queue status constraint to allow 'ready' status
-- and add proper duplicate prevention

-- Update the queue status constraint to include 'ready'
ALTER TABLE public.queue DROP CONSTRAINT IF EXISTS queue_status_check;
ALTER TABLE public.queue ADD CONSTRAINT queue_status_check 
  CHECK (status IN ('queued', 'playing', 'played', 'ready'));

-- Add unique constraint to prevent duplicate songs in queue
ALTER TABLE public.queue ADD CONSTRAINT unique_song_in_queue 
  UNIQUE (song_id);