-- Create table to track user song plays
CREATE TABLE public.user_song_plays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id UUID NOT NULL,
  play_count INTEGER NOT NULL DEFAULT 1,
  first_played_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_played_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, song_id)
);

-- Enable Row Level Security
ALTER TABLE public.user_song_plays ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own plays" 
ON public.user_song_plays 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own plays" 
ON public.user_song_plays 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own plays" 
ON public.user_song_plays 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Allow anonymous users to track plays too (for guest users)
CREATE POLICY "Anonymous users can insert plays without user_id" 
ON public.user_song_plays 
FOR INSERT 
WITH CHECK (user_id IS NULL);

CREATE POLICY "Anonymous users can view plays without user_id" 
ON public.user_song_plays 
FOR SELECT 
USING (user_id IS NULL);

CREATE POLICY "Anonymous users can update plays without user_id" 
ON public.user_song_plays 
FOR UPDATE 
USING (user_id IS NULL);

-- Admins can view all plays for analytics
CREATE POLICY "Admins can view all plays" 
ON public.user_song_plays 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_user_song_plays_updated_at
BEFORE UPDATE ON public.user_song_plays
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to track or increment play count
CREATE OR REPLACE FUNCTION public.track_song_play(
  _song_id UUID,
  _user_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert or update play count
  INSERT INTO public.user_song_plays (user_id, song_id, play_count, first_played_at, last_played_at)
  VALUES (_user_id, _song_id, 1, now(), now())
  ON CONFLICT (user_id, song_id) 
  DO UPDATE SET 
    play_count = user_song_plays.play_count + 1,
    last_played_at = now(),
    updated_at = now();
END;
$$;