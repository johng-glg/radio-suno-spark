-- Create table to track user song interactions (likes/dislikes)
CREATE TABLE public.user_song_interactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  interaction_type text NOT NULL CHECK (interaction_type IN ('like', 'dislike')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, song_id)
);

-- Enable RLS
ALTER TABLE public.user_song_interactions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own interactions" 
ON public.user_song_interactions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own interactions" 
ON public.user_song_interactions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own interactions" 
ON public.user_song_interactions 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own interactions" 
ON public.user_song_interactions 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_user_song_interactions_updated_at
BEFORE UPDATE ON public.user_song_interactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();