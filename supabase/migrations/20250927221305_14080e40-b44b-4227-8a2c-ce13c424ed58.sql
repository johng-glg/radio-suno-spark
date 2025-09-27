-- Create Prompt_Templates table
CREATE TABLE public.prompt_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create Word_Pools table
CREATE TABLE public.word_pools (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('mood', 'genre', 'instrument', 'tempo', 'twist')),
  value TEXT NOT NULL,
  weight INTEGER DEFAULT 1, -- For weighted random selection
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(type, value) -- Prevent duplicate entries
);

-- Enable RLS
ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.word_pools ENABLE ROW LEVEL SECURITY;

-- Create policies - make these publicly readable for music generation
CREATE POLICY "Anyone can view prompt templates" 
ON public.prompt_templates 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert prompt templates" 
ON public.prompt_templates 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can view word pools" 
ON public.word_pools 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert word pools" 
ON public.word_pools 
FOR INSERT 
WITH CHECK (true);

-- Add updated_at trigger for prompt_templates
CREATE TRIGGER update_prompt_templates_updated_at
BEFORE UPDATE ON public.prompt_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert sample prompt templates
INSERT INTO public.prompt_templates (template) VALUES
('Create a {mood} {genre} track with {instrument} and {tempo} tempo'),
('A {tempo} {genre} song with {mood} vibes featuring {instrument}'),
('Generate a {genre} piece with {mood} energy, {tempo} rhythm and {instrument}'),
('Make a {mood} {genre} composition using {instrument} at {tempo} pace'),
('{mood} {genre} music with {instrument} and {tempo} beat'),
('A {genre} track that feels {mood} with {instrument} and {tempo} timing'),
('Create {mood} {genre} sounds featuring {instrument} with {tempo} energy'),
('{tempo} {genre} with {mood} atmosphere and beautiful {instrument}');

-- Insert sample word pools
INSERT INTO public.word_pools (type, value, weight) VALUES
-- Moods
('mood', 'energetic', 3),
('mood', 'melancholic', 2),
('mood', 'uplifting', 3),
('mood', 'dreamy', 2),
('mood', 'mysterious', 2),
('mood', 'peaceful', 2),
('mood', 'intense', 2),
('mood', 'nostalgic', 2),
('mood', 'euphoric', 2),
('mood', 'contemplative', 1),

-- Genres
('genre', 'electronic', 3),
('genre', 'ambient', 2),
('genre', 'indie', 3),
('genre', 'folk', 2),
('genre', 'jazz', 2),
('genre', 'classical', 1),
('genre', 'rock', 3),
('genre', 'pop', 3),
('genre', 'hip-hop', 2),
('genre', 'synthwave', 2),

-- Instruments
('instrument', 'piano', 3),
('instrument', 'guitar', 3),
('instrument', 'violin', 2),
('instrument', 'synthesizer', 3),
('instrument', 'drums', 2),
('instrument', 'flute', 1),
('instrument', 'saxophone', 2),
('instrument', 'cello', 1),
('instrument', 'bass', 2),
('instrument', 'strings', 2),

-- Tempo
('tempo', 'slow', 2),
('tempo', 'medium', 3),
('tempo', 'fast', 2),
('tempo', 'relaxed', 2),
('tempo', 'driving', 2),
('tempo', 'pulsing', 1),
('tempo', 'flowing', 2),
('tempo', 'steady', 2),

-- Twist words (for Wild Card Mode)
('twist', 'with glitchy effects', 1),
('twist', 'in reverse', 1),
('twist', 'with vinyl crackle', 1),
('twist', 'underwater style', 1),
('twist', 'with cathedral reverb', 1),
('twist', 'lo-fi aesthetic', 2),
('twist', 'with nature sounds', 1),
('twist', 'minimalist approach', 1),
('twist', 'with vocal chops', 1),
('twist', 'retro-futuristic', 1);

-- Add user preferences table for thumbs down tracking
CREATE TABLE public.user_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  excluded_moods TEXT[] DEFAULT '{}',
  excluded_instruments TEXT[] DEFAULT '{}',
  wild_card_mode BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS for user preferences
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Create policies for user preferences
CREATE POLICY "Users can view their own preferences" 
ON public.user_preferences 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences" 
ON public.user_preferences 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences" 
ON public.user_preferences 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Add updated_at trigger for user_preferences
CREATE TRIGGER update_user_preferences_updated_at
BEFORE UPDATE ON public.user_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();