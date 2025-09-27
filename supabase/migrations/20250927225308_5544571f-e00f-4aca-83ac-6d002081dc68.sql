-- Create a function to seed pre-made songs for each genre
CREATE OR REPLACE FUNCTION seed_premade_songs()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    genre_list text[] := ARRAY['electronic', 'pop', 'rock', 'jazz', 'classical', 'hip-hop', 'indie', 'ambient', 'folk', 'metal'];
    current_genre text;
BEGIN
    FOREACH current_genre IN ARRAY genre_list
    LOOP
        -- Insert 3 pre-made songs per genre if they don't exist
        INSERT INTO public.songs (title, genre, mood, status, url, description, prompt)
        SELECT 
            current_genre || ' Starter Track ' || generate_series,
            current_genre,
            'neutral',
            'ready',
            'https://www.soundjay.com/misc/sounds/fail-buzzer-02.wav', -- Placeholder URL
            'A pre-made ' || current_genre || ' track ready to play instantly',
            'Pre-made ' || current_genre || ' composition for instant playback'
        FROM generate_series(1, 3)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.songs 
            WHERE genre = current_genre 
            AND title LIKE current_genre || ' Starter Track %'
        );
    END LOOP;
END;
$$;

-- Call the function to seed the data
SELECT seed_premade_songs();

-- Create an index for faster genre-based queries
CREATE INDEX IF NOT EXISTS idx_songs_genre_status ON songs(genre, status);

-- Add these pre-made songs to the queue for immediate availability
INSERT INTO public.queue (song_id, position, status)
SELECT 
    s.id,
    ROW_NUMBER() OVER (ORDER BY s.created_at) + COALESCE(MAX(q.position), 0),
    'queued'
FROM songs s
LEFT JOIN queue q ON TRUE
WHERE s.status = 'ready' 
AND s.title LIKE '% Starter Track %'
AND NOT EXISTS (SELECT 1 FROM queue WHERE song_id = s.id)
GROUP BY s.id, s.created_at;