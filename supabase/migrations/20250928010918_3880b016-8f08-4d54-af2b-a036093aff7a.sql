-- Add more diverse mood words to break up repetitive patterns
INSERT INTO word_pools (type, value, weight) VALUES
('mood', 'chill', 3),
('mood', 'groovy', 2),
('mood', 'haunting', 1),
('mood', 'serene', 2),
('mood', 'gritty', 2),
('mood', 'atmospheric', 2),
('mood', 'raw', 2),
('mood', 'soulful', 2),
('mood', 'dynamic', 2),
('mood', 'ethereal', 1),
('mood', 'driving', 2),
('mood', 'reflective', 2);

-- Add some additional tempo variations
INSERT INTO word_pools (type, value, weight) VALUES
('tempo', 'laid-back', 2),
('tempo', 'urgent', 1),
('tempo', 'hypnotic', 1),
('tempo', 'rhythmic', 2);

-- Add more diverse prompt templates to vary the structure
INSERT INTO prompt_templates (template) VALUES
('Create a {tempo} {genre} journey with {mood} {instrument} melodies'),
('A {mood} {genre} experience featuring {instrument} with {tempo} flow'),
('Build {genre} soundscapes with {mood} atmosphere and {tempo} {instrument}'),
('Craft a {genre} composition that blends {mood} tones with {tempo} {instrument}'),
('{tempo} {genre} fusion with {instrument} creating {mood} textures');