-- Add missing aggressive hip-hop moods (checking for duplicates)
INSERT INTO word_pools (type, value, weight) 
SELECT 'mood', mood_value, weight_value FROM (VALUES
  ('aggressive', 3),
  ('bold', 2),
  ('fierce', 2),
  ('powerful', 3),
  ('punchy', 2),
  ('heavy', 3),
  ('menacing', 2),
  ('militant', 1),
  ('rebellious', 2),
  ('edgy', 2)
) AS new_moods(mood_value, weight_value)
WHERE NOT EXISTS (
  SELECT 1 FROM word_pools 
  WHERE type = 'mood' AND value = mood_value
);

-- Add missing rap/hip-hop specific instruments
INSERT INTO word_pools (type, value, weight) 
SELECT 'instrument', instrument_value, weight_value FROM (VALUES
  ('808 drums', 4),
  ('heavy bass', 3),
  ('trap drums', 3),
  ('boom bap', 2),
  ('sub bass', 3),
  ('kick drums', 2),
  ('snare hits', 2),
  ('brass stabs', 2),
  ('vinyl scratches', 1),
  ('vocal chops', 2)
) AS new_instruments(instrument_value, weight_value)
WHERE NOT EXISTS (
  SELECT 1 FROM word_pools 
  WHERE type = 'instrument' AND value = instrument_value
);

-- Add missing aggressive tempos
INSERT INTO word_pools (type, value, weight) 
SELECT 'tempo', tempo_value, weight_value FROM (VALUES
  ('hard-hitting', 3),
  ('banging', 2),
  ('pounding', 2),
  ('crushing', 2),
  ('thunderous', 2),
  ('explosive', 2),
  ('relentless', 1),
  ('brutal', 1)
) AS new_tempos(tempo_value, weight_value)
WHERE NOT EXISTS (
  SELECT 1 FROM word_pools 
  WHERE type = 'tempo' AND value = tempo_value
);

-- Add rap-specific prompt templates
INSERT INTO prompt_templates (template) 
SELECT template_value FROM (VALUES
  ('A {mood} rap track with {tempo} {instrument} that hits hard'),
  ('Create {mood} hip-hop with {tempo} {instrument} and aggressive delivery'),
  ('Generate a {tempo} rap banger with {mood} energy and {instrument}'),
  ('Build a {mood} hip-hop anthem featuring {tempo} {instrument}'),
  ('Craft hard-hitting {genre} with {mood} vibes and {tempo} {instrument}'),
  ('A street-ready {genre} track with {mood} attitude and {instrument}'),
  ('Create {tempo} {genre} with {mood} bars over {instrument}')
) AS new_templates(template_value)
WHERE NOT EXISTS (
  SELECT 1 FROM prompt_templates 
  WHERE template = template_value
);