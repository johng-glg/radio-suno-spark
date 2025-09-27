-- Update songs that have lyrics in description field with proper descriptions
UPDATE songs 
SET description = CASE 
  WHEN title = 'Neon Pulse' THEN 'An energetic ambient track with pulsing electronic beats and atmospheric textures'
  WHEN title = 'Celestial Echoes' THEN 'A dreamy electronic composition featuring ethereal melodies and cosmic soundscapes'  
  WHEN title = 'Neon Horizon' THEN 'An intense synthwave journey through neon-lit cityscapes with driving rhythms'
  WHEN title = 'Flute Salad' THEN 'An upbeat jazz composition featuring bright piano chords, walking bass, and smooth flute melodies'
  WHEN title = 'Whispers in the Rain' THEN 'A peaceful rock ballad with gentle guitar arpeggios, violin melodies, and atmospheric textures'
  ELSE 'A ' || COALESCE(mood, 'atmospheric') || ' ' || genre || ' composition with unique musical elements'
END
WHERE description LIKE '[Verse]%' OR description LIKE '%[Chorus]%' OR description LIKE '%[Bridge]%';