-- Create songs table
CREATE TABLE public.songs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt TEXT NOT NULL,
  genre TEXT NOT NULL,
  mood TEXT,
  status TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'playing', 'finished')),
  url TEXT,
  title TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create queue table
CREATE TABLE public.queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'playing', 'played')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create prompt_pools table
CREATE TABLE public.prompt_pools (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('mood', 'instrument', 'twist', 'tempo', 'genre')),
  value TEXT NOT NULL,
  weight INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_pools ENABLE ROW LEVEL SECURITY;

-- Create policies for songs (public read for radio functionality)
CREATE POLICY "Anyone can view songs" 
ON public.songs 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert songs" 
ON public.songs 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update songs" 
ON public.songs 
FOR UPDATE 
USING (true);

-- Create policies for queue (public access for radio functionality)
CREATE POLICY "Anyone can view queue" 
ON public.queue 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can manage queue" 
ON public.queue 
FOR ALL 
USING (true);

-- Create policies for prompt_pools (public read)
CREATE POLICY "Anyone can view prompt pools" 
ON public.prompt_pools 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert prompt pools" 
ON public.prompt_pools 
FOR INSERT 
WITH CHECK (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_songs_updated_at
  BEFORE UPDATE ON public.songs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial prompt pool data
INSERT INTO public.prompt_pools (type, value, weight) VALUES
  -- Genres
  ('genre', 'Lo-fi', 3),
  ('genre', 'Country', 2),
  ('genre', 'EDM', 3),
  ('genre', 'Jazz', 2),
  ('genre', 'Ambient', 2),
  ('genre', 'Rock', 2),
  ('genre', 'Hip-Hop', 2),
  ('genre', 'Classical', 1),
  ('genre', 'Folk', 2),
  ('genre', 'Electronic', 3),
  
  -- Moods
  ('mood', 'upbeat', 3),
  ('mood', 'chill', 4),
  ('mood', 'dark', 2),
  ('mood', 'dreamy', 3),
  ('mood', 'epic', 2),
  ('mood', 'melancholic', 2),
  ('mood', 'energetic', 3),
  ('mood', 'peaceful', 3),
  
  -- Instruments
  ('instrument', 'piano', 3),
  ('instrument', 'guitar', 4),
  ('instrument', 'synthesizer', 3),
  ('instrument', 'drums', 2),
  ('instrument', 'violin', 2),
  ('instrument', 'saxophone', 2),
  ('instrument', 'bass', 2),
  ('instrument', 'vocals', 3),
  
  -- Tempo
  ('tempo', 'slow', 2),
  ('tempo', 'medium', 3),
  ('tempo', 'fast', 2),
  ('tempo', 'very slow', 1),
  ('tempo', 'very fast', 2),
  
  -- Twists
  ('twist', 'with a nostalgic feeling', 2),
  ('twist', 'with nature sounds', 1),
  ('twist', 'with retro vibes', 2),
  ('twist', 'with space themes', 1),
  ('twist', 'with emotional depth', 3),
  ('twist', 'with minimalist style', 2),
  ('twist', 'with experimental elements', 1);