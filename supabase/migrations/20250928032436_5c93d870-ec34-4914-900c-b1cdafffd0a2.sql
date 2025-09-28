-- Remove templates with hardcoded genres
DELETE FROM prompt_templates WHERE template LIKE '%rap%' OR template LIKE '%hip-hop%';

-- Add better templates that properly use {genre} placeholder
INSERT INTO prompt_templates (template) VALUES
  ('A soulful {genre} piece with {mood} expression and {instrument}'),
  ('Create a {tempo} {genre} arrangement featuring {mood} {instrument}'),
  ('Build a {genre} composition with {mood} dynamics and {tempo} {instrument}'),
  ('Craft {mood} {genre} music with expressive {instrument} and {tempo} rhythm'),
  ('Generate a {genre} track that captures {mood} feelings through {tempo} {instrument}'),
  ('A {tempo} {genre} creation with {mood} ambiance and beautiful {instrument}'),
  ('Make a {genre} song with {mood} character and flowing {tempo} {instrument}'),
  ('Design {mood} {genre} sounds featuring melodic {instrument} with {tempo} groove');