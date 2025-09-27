-- Fix the function search path security issue
DROP FUNCTION IF EXISTS seed_premade_songs();

CREATE OR REPLACE FUNCTION seed_premade_songs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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