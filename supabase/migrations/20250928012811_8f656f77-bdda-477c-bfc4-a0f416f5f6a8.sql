-- Add more aggressive hip-hop moods
INSERT INTO word_pools (type, value, weight) VALUES
('mood', 'hard', 3),
('mood', 'aggressive', 3),
('mood', 'bold', 2),
('mood', 'fierce', 2),
('mood', 'powerful', 3),
('mood', 'punchy', 2),
('mood', 'heavy', 3),
('mood', 'dark', 2),
('mood', 'menacing', 2),
('mood', 'militant', 1),
('mood', 'rebellious', 2),
('mood', 'edgy', 2);

-- Add more rap/hip-hop specific instruments and sounds
INSERT INTO word_pools (type, value, weight) VALUES
('instrument', '808 drums', 4),
('instrument', 'heavy bass', 3),
('instrument', 'trap drums', 3),
('instrument', 'boom bap', 2),
('instrument', 'sub bass', 3),
('instrument', 'kick drums', 2),
('instrument', 'snare hits', 2),
('instrument', 'brass stabs', 2),
('instrument', 'vinyl scratches', 1),
('instrument', 'vocal chops', 2);

-- Add more aggressive tempos
INSERT INTO word_pools (type, value, weight) VALUES
('tempo', 'hard-hitting', 3),
('tempo', 'banging', 2),
('tempo', 'pounding', 2),
('tempo', 'crushing', 2),
('tempo', 'thunderous', 2),
('tempo', 'explosive', 2),
('tempo', 'relentless', 1),
('tempo', 'brutal', 1);

-- Add some rap-specific prompt templates
INSERT INTO prompt_templates (template) VALUES
('A {mood} rap track with {tempo} {instrument} that hits hard'),
('Create {mood} hip-hop with {tempo} {instrument} and aggressive delivery'),
('Generate a {tempo} rap banger with {mood} energy and {instrument}'),
('Build a {mood} hip-hop anthem featuring {tempo} {instrument}'),
('Craft hard-hitting {genre} with {mood} vibes and {tempo} {instrument}'),
('A street-ready {genre} track with {mood} attitude and {instrument}'),
('Create {tempo} {genre} with {mood} bars over {instrument}');