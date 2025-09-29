-- Clear existing genre and mood entries from word_pools
DELETE FROM public.word_pools WHERE type IN ('genre', 'mood');

-- Insert LandingPage genres (lowercase for consistency)
INSERT INTO public.word_pools (type, value, weight) VALUES
('genre', 'classical', 1),
('genre', 'edm', 1),
('genre', 'pop', 1),
('genre', 'rock', 1),
('genre', 'jazz', 1),
('genre', 'hip-hop', 1),
('genre', 'country', 1);

-- Insert LandingPage moods (lowercase for consistency)
INSERT INTO public.word_pools (type, value, weight) VALUES
('mood', 'upbeat', 1),
('mood', 'chill', 1),
('mood', 'aggressive', 1),
('mood', 'emotional', 1),
('mood', 'epic', 1),
('mood', 'playful', 1);