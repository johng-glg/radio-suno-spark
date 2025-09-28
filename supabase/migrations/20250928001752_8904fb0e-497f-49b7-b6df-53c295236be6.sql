-- Add suno_id column to songs table to store Suno API clip IDs
ALTER TABLE public.songs 
ADD COLUMN suno_id TEXT;

-- Create index for better performance when querying by suno_id
CREATE INDEX idx_songs_suno_id ON public.songs(suno_id);