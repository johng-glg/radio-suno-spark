CREATE OR REPLACE FUNCTION public.library_genres()
 RETURNS TABLE(genre text, n bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT lower(s.genre) AS genre, count(*) AS n
  FROM public.songs s
  WHERE s.status = 'ready' AND s.is_public = true AND s.url IS NOT NULL AND s.storage_path IS NOT NULL
  GROUP BY lower(s.genre)
  ORDER BY n DESC;
$function$;

CREATE OR REPLACE FUNCTION public.next_track(p_station uuid DEFAULT NULL::uuid, p_genres text[] DEFAULT '{}'::text[], p_mood text DEFAULT NULL::text, p_exclude uuid[] DEFAULT '{}'::uuid[])
 RETURNS SETOF songs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_station public.stations%ROWTYPE;
  v_taste jsonb := '{}'::jsonb;
  v_genres text[] := COALESCE(p_genres, '{}');
  v_mood text := lower(p_mood);
  v_song public.songs%ROWTYPE;
BEGIN
  IF p_station IS NOT NULL THEN
    SELECT * INTO v_station
    FROM public.stations
    WHERE id = p_station AND user_id = auth.uid();

    IF FOUND THEN
      v_taste := v_station.taste;
      IF cardinality(v_genres) = 0 THEN v_genres := v_station.genres; END IF;
      IF v_mood IS NULL THEN v_mood := lower(v_station.mood); END IF;
    END IF;
  END IF;

  SELECT s.* INTO v_song
  FROM public.songs s
  WHERE s.status = 'ready'
    AND s.is_public = true
    AND s.url IS NOT NULL
    AND s.storage_path IS NOT NULL
    AND NOT (s.id = ANY (COALESCE(p_exclude, '{}')))
    AND (v_station.id IS NULL OR s.id NOT IN (
      SELECT sp.song_id FROM public.station_plays sp
      WHERE sp.station_id = v_station.id
        AND sp.signal IN ('play', 'complete', 'skip')
      ORDER BY sp.created_at DESC
      LIMIT 30
    ))
    AND (v_station.id IS NULL OR s.id NOT IN (
      SELECT sp.song_id FROM public.station_plays sp
      WHERE sp.station_id = v_station.id AND sp.signal = 'dislike'
    ))
  ORDER BY
    ((CASE WHEN cardinality(v_genres) = 0 OR lower(s.genre) = ANY (SELECT lower(g) FROM unnest(v_genres) g)
        THEN 2 ELSE 0 END)
     + (CASE WHEN v_mood IS NULL OR lower(s.mood) = v_mood THEN 1 ELSE 0 END)) DESC,
    (COALESCE((v_taste ->> ('genre:' || lower(s.genre)))::numeric, 0) * 2
     + COALESCE((v_taste ->> ('mood:' || lower(s.mood)))::numeric, 0)
     + random() * 4) DESC
  LIMIT 1;

  IF v_song.id IS NULL THEN
    RETURN;
  END IF;

  IF v_station.id IS NOT NULL THEN
    INSERT INTO public.station_plays (station_id, song_id, signal)
    VALUES (v_station.id, v_song.id, 'play');

    UPDATE public.stations SET last_tuned_at = now() WHERE id = v_station.id;
  END IF;

  RETURN NEXT v_song;
END;
$function$;