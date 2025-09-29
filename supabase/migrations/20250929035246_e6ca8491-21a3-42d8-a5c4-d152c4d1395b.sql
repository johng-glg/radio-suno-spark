-- First, drop the existing check constraint on word_pools type
ALTER TABLE public.word_pools DROP CONSTRAINT IF EXISTS word_pools_type_check;

-- Add new constraint that includes all the types we need
ALTER TABLE public.word_pools ADD CONSTRAINT word_pools_type_check 
CHECK (type IN ('genre', 'instrument', 'mood', 'tempo', 'twist', 'setting', 'energy', 'era'));

-- Now add all the new entries
-- Add missing instruments (skip existing ones)
INSERT INTO public.word_pools (type, value, weight) 
SELECT 'instrument', value, 1
FROM (VALUES 
  ('trumpet'),
  ('trombone'),
  ('banjo'),
  ('mandolin'),
  ('clarinet'),
  ('harmonica'),
  ('drum machine'),
  ('steel drums'),
  ('accordion'),
  ('harp'),
  ('tabla'),
  ('electric sitar'),
  ('bass guitar')
) AS new_instruments(value)
WHERE NOT EXISTS (
  SELECT 1 FROM public.word_pools 
  WHERE type = 'instrument' AND public.word_pools.value = new_instruments.value
);

-- Add missing tempo entries
INSERT INTO public.word_pools (type, value, weight) 
SELECT 'tempo', value, 1
FROM (VALUES 
  ('moderate'),
  ('swinging')
) AS new_tempo(value)
WHERE NOT EXISTS (
  SELECT 1 FROM public.word_pools 
  WHERE type = 'tempo' AND public.word_pools.value = new_tempo.value
);

-- Add new twist entries
INSERT INTO public.word_pools (type, value, weight) 
SELECT 'twist', value, 1
FROM (VALUES 
  ('with cinematic flair'),
  ('with glitchy textures'),
  ('with psychedelic layers'),
  ('with world music fusion'),
  ('with minimalist arrangements'),
  ('with lo-fi crackle'),
  ('with gospel choir harmonies'),
  ('with robotic vocals'),
  ('with vintage tape effects'),
  ('with futuristic AI vocals'),
  ('with orchestral strings'),
  ('with Latin percussion'),
  ('with jazz improvisation'),
  ('with bluesy undertones'),
  ('with heavy distortion'),
  ('with dreamy reverb'),
  ('with hypnotic repetition'),
  ('with complex polyrhythms'),
  ('with folk storytelling'),
  ('with experimental sound design')
) AS new_twists(value)
WHERE NOT EXISTS (
  SELECT 1 FROM public.word_pools 
  WHERE type = 'twist' AND public.word_pools.value = new_twists.value
);

-- Add new setting entries
INSERT INTO public.word_pools (type, value, weight) VALUES
('setting', 'at a summer festival', 1),
('setting', 'in a smoky jazz club', 1),
('setting', 'on a futuristic spaceship', 1),
('setting', 'by a campfire', 1),
('setting', 'in a cathedral', 1),
('setting', 'at a beach party', 1),
('setting', 'in an underground rave', 1),
('setting', 'inside a video game arcade', 1),
('setting', 'in a grand concert hall', 1),
('setting', 'on a quiet mountain peak', 1),
('setting', 'in a neon-lit cityscape', 1),
('setting', 'at a royal palace', 1),
('setting', 'in a bustling marketplace', 1),
('setting', 'on a deserted island', 1),
('setting', 'in a cozy living room', 1),
('setting', 'at a late-night diner', 1),
('setting', 'in a recording studio', 1),
('setting', 'on a long road trip', 1),
('setting', 'at a school dance', 1),
('setting', 'in an enchanted forest', 1);

-- Add new energy entries
INSERT INTO public.word_pools (type, value, weight) VALUES
('energy', 'low', 1),
('energy', 'medium', 1),
('energy', 'high', 1),
('energy', 'explosive', 1),
('energy', 'mellow', 1);

-- Add new era entries
INSERT INTO public.word_pools (type, value, weight) VALUES
('era', '70s', 1),
('era', '80s', 1),
('era', '90s', 1),
('era', '2000s', 1),
('era', '2010s', 1),
('era', '1960s', 1),
('era', '1950s', 1),
('era', 'futuristic', 1),
('era', 'timeless', 1),
('era', 'classical era', 1);