INSERT INTO public.songs (prompt, genre, mood, title, status, description, is_public, requested_by)
SELECT
  'A ' || m || ' brasscore track featuring ' || d || ', well produced and radio ready',
  'brasscore',
  m,
  'Brasscore ' || upper(substr(m,1,1)) || substr(m,2),
  'generating',
  'Seeded ' || m || ' brasscore track',
  true,
  NULL
FROM (
  SELECT
    (ARRAY['upbeat','chill','aggressive','emotional','epic','playful'])[floor(random()*6)+1] AS m,
    (ARRAY[
      'aggressive drops, jazz dubstep, saxophone lead, heavy bass drop',
      'electro swing, dubstep drop, brass stabs, aggressive',
      'jazzstep, neurofunk, upright bass, fast drums',
      'jazz trap, sax solo, 808s, hard drop',
      'big band, riddim dubstep, festival drop'
    ])[floor(random()*5)+1] AS d
  FROM generate_series(1,10)
) seed;