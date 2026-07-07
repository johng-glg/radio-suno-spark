-- ============================================================
-- SPARK REDESIGN: per-user stations, taste loop, server-side
-- track selection, and background commissioning.
--
-- Design: listening and generating run on separate clocks.
--   * next_track()        — fast lane: pick the next ready song NOW
--   * record_feedback()   — taste lane: like/skip/complete nudge a
--                           per-station taste vector
--   * commission_track()  — supply lane: insert a 'generating' song
--                           aimed at the station's taste; the existing
--                           pg_cron workers (complete-pending-generations)
--                           create + finish the Suno task in background
-- ============================================================

-- ---------- stations ----------
CREATE TABLE IF NOT EXISTS public.stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'My Station',
  genres text[] NOT NULL DEFAULT '{}',
  mood text,
  instrumental boolean NOT NULL DEFAULT false,
  wildcard boolean NOT NULL DEFAULT false,
  holiday text,
  -- taste vector: {"genre:jazz": 2.5, "mood:chill": -1.0, ...} clamped to [-10, 10]
  taste jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_tuned_at timestamptz
);

ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own stations"
ON public.stations
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_stations_user ON public.stations(user_id);

-- ---------- station_plays (history + feedback signals) ----------
CREATE TABLE IF NOT EXISTS public.station_plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  signal text NOT NULL CHECK (signal IN ('play', 'complete', 'skip', 'like', 'dislike')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.station_plays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view plays on their stations"
ON public.station_plays
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.stations s
  WHERE s.id = station_id AND s.user_id = auth.uid()
));
-- Inserts happen exclusively through SECURITY DEFINER functions below.

CREATE INDEX IF NOT EXISTS idx_station_plays_station
  ON public.station_plays(station_id, created_at DESC);

-- ---------- songs: commissioning provenance ----------
ALTER TABLE public.songs
  ADD COLUMN IF NOT EXISTS commissioned_by uuid,
  ADD COLUMN IF NOT EXISTS station_id uuid;

CREATE INDEX IF NOT EXISTS idx_songs_ready_public
  ON public.songs(genre, mood) WHERE status = 'ready' AND is_public = true AND url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_songs_generating
  ON public.songs(station_id) WHERE status = 'generating';

-- ---------- updated_at maintenance ----------
CREATE OR REPLACE FUNCTION public.spark_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stations_touch ON public.stations;
CREATE TRIGGER trg_stations_touch
BEFORE UPDATE ON public.stations
FOR EACH ROW EXECUTE FUNCTION public.spark_touch_updated_at();

-- ============================================================
-- next_track: the fast lane.
-- Picks one ready, public song ranked by the station's taste,
-- excluding recent plays and dislikes. Works for anonymous
-- listeners (no station: pure genre/mood filter + jitter).
-- ============================================================
CREATE OR REPLACE FUNCTION public.next_track(
  p_station uuid DEFAULT NULL,
  p_genres text[] DEFAULT '{}',
  p_mood text DEFAULT NULL,
  p_exclude uuid[] DEFAULT '{}'
)
RETURNS SETOF public.songs
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_station public.stations%ROWTYPE;
  v_taste jsonb := '{}'::jsonb;
  v_genres text[] := COALESCE(p_genres, '{}');
  v_mood text := lower(p_mood);
  v_song public.songs%ROWTYPE;
BEGIN
  -- Resolve station (must belong to caller)
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
    AND NOT (s.id = ANY (COALESCE(p_exclude, '{}')))
    -- never replay the station's recent history
    AND (v_station.id IS NULL OR s.id NOT IN (
      SELECT sp.song_id FROM public.station_plays sp
      WHERE sp.station_id = v_station.id
        AND sp.signal IN ('play', 'complete', 'skip')
      ORDER BY sp.created_at DESC
      LIMIT 30
    ))
    -- never replay something this station disliked
    AND (v_station.id IS NULL OR s.id NOT IN (
      SELECT sp.song_id FROM public.station_plays sp
      WHERE sp.station_id = v_station.id AND sp.signal = 'dislike'
    ))
  ORDER BY
    -- tiered match: genre+mood > genre > mood > anything (graceful relax)
    ((CASE WHEN cardinality(v_genres) = 0 OR lower(s.genre) = ANY (SELECT lower(g) FROM unnest(v_genres) g)
        THEN 2 ELSE 0 END)
     + (CASE WHEN v_mood IS NULL OR lower(s.mood) = v_mood THEN 1 ELSE 0 END)) DESC,
    -- taste-weighted with jitter: taste dominates when strong, random when neutral
    (COALESCE((v_taste ->> ('genre:' || lower(s.genre)))::numeric, 0) * 2
     + COALESCE((v_taste ->> ('mood:' || lower(s.mood)))::numeric, 0)
     + random() * 4) DESC
  LIMIT 1;

  IF v_song.id IS NULL THEN
    RETURN;
  END IF;

  -- Log the play + freshen the station
  IF v_station.id IS NOT NULL THEN
    INSERT INTO public.station_plays (station_id, song_id, signal)
    VALUES (v_station.id, v_song.id, 'play');

    UPDATE public.stations SET last_tuned_at = now() WHERE id = v_station.id;
  END IF;

  RETURN NEXT v_song;
END;
$$;

-- ============================================================
-- record_feedback: the taste lane.
-- One call does two jobs: logs the signal and nudges the
-- station's taste vector. Returns the updated taste.
-- Weights: like +2, complete +1, skip -1.5, dislike -2.5.
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_feedback(
  p_station uuid,
  p_song uuid,
  p_signal text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_station public.stations%ROWTYPE;
  v_song public.songs%ROWTYPE;
  v_weight numeric;
  v_taste jsonb;
  v_key text;
  v_val numeric;
BEGIN
  IF p_signal NOT IN ('complete', 'skip', 'like', 'dislike') THEN
    RAISE EXCEPTION 'Invalid signal: %', p_signal;
  END IF;

  SELECT * INTO v_station FROM public.stations
  WHERE id = p_station AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Station not found or not yours';
  END IF;

  SELECT * INTO v_song FROM public.songs WHERE id = p_song;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Song not found';
  END IF;

  INSERT INTO public.station_plays (station_id, song_id, signal)
  VALUES (p_station, p_song, p_signal);

  v_weight := CASE p_signal
    WHEN 'like' THEN 2.0
    WHEN 'complete' THEN 1.0
    WHEN 'skip' THEN -1.5
    WHEN 'dislike' THEN -2.5
  END;

  v_taste := v_station.taste;

  -- Nudge genre and mood affinities, clamped to [-10, 10]
  FOREACH v_key IN ARRAY ARRAY[
    'genre:' || lower(COALESCE(v_song.genre, '')),
    'mood:' || lower(COALESCE(v_song.mood, ''))
  ] LOOP
    CONTINUE WHEN v_key IN ('genre:', 'mood:');
    v_val := LEAST(10, GREATEST(-10,
      COALESCE((v_taste ->> v_key)::numeric, 0) + v_weight));
    v_taste := jsonb_set(v_taste, ARRAY[v_key], to_jsonb(round(v_val, 2)), true);
  END LOOP;

  UPDATE public.stations SET taste = v_taste WHERE id = p_station;

  RETURN v_taste;
END;
$$;

-- ============================================================
-- commission_track: the supply lane.
-- Inserts a 'generating' song aimed at the station's taste and
-- returns immediately. The existing pg_cron worker
-- (complete-pending-generations) creates the Suno task and
-- finishes it in the background — nobody waits on this.
-- Guardrails: per-station, per-user, and global in-flight caps.
-- ============================================================
CREATE OR REPLACE FUNCTION public.commission_track(p_station uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_station public.stations%ROWTYPE;
  v_genre text;
  v_mood text;
  v_template text;
  v_prompt text;
  v_placeholder text;
  v_word text;
  v_song_id uuid;
  v_inflight_station int;
  v_inflight_global int;
  v_recent_user int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to commission new tracks';
  END IF;

  SELECT * INTO v_station FROM public.stations
  WHERE id = p_station AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Station not found or not yours';
  END IF;

  -- Guardrails ------------------------------------------------
  SELECT count(*) INTO v_inflight_station FROM public.songs
  WHERE station_id = p_station AND status = 'generating';
  IF v_inflight_station >= 2 THEN
    RETURN NULL; -- shelf is already being stocked
  END IF;

  SELECT count(*) INTO v_inflight_global FROM public.songs
  WHERE status = 'generating' AND created_at > now() - interval '15 minutes';
  IF v_inflight_global >= 4 THEN
    RETURN NULL; -- protect the Suno concurrency limit
  END IF;

  SELECT count(*) INTO v_recent_user FROM public.songs
  WHERE commissioned_by = auth.uid() AND created_at > now() - interval '1 hour';
  IF v_recent_user >= 10 THEN
    RETURN NULL; -- per-user hourly budget
  END IF;

  -- Aim the factory: favour the station's strongest taste ------
  SELECT g INTO v_genre
  FROM unnest(CASE WHEN cardinality(v_station.genres) > 0
                   THEN v_station.genres
                   ELSE (SELECT array_agg(DISTINCT value) FROM public.word_pools WHERE type = 'genre')
              END) g
  ORDER BY COALESCE((v_station.taste ->> ('genre:' || lower(g)))::numeric, 0) + random() * 3 DESC
  LIMIT 1;

  IF v_station.mood IS NOT NULL THEN
    v_mood := lower(v_station.mood);
  ELSE
    SELECT value INTO v_mood FROM public.word_pools WHERE type = 'mood'
    ORDER BY COALESCE((v_station.taste ->> ('mood:' || lower(value)))::numeric, 0) + random() * 3 DESC
    LIMIT 1;
  END IF;

  -- Build the prompt from a random template + word pools -------
  SELECT template INTO v_template FROM public.prompt_templates
  ORDER BY random() LIMIT 1;
  IF v_template IS NULL THEN
    v_template := 'A {mood} {genre} track featuring {instrument} at a {tempo} pace';
  END IF;

  v_prompt := v_template;
  v_prompt := replace(v_prompt, '{genre}', lower(v_genre));
  v_prompt := replace(v_prompt, '{mood}', v_mood);

  FOR v_placeholder IN
    SELECT DISTINCT (regexp_matches(v_prompt, '\{(\w+)\}', 'g'))[1]
  LOOP
    SELECT value INTO v_word FROM public.word_pools
    WHERE type = v_placeholder
    ORDER BY random() LIMIT 1;
    IF v_word IS NOT NULL THEN
      v_prompt := replace(v_prompt, '{' || v_placeholder || '}', v_word);
    END IF;
  END LOOP;

  IF v_station.wildcard THEN
    SELECT value INTO v_word FROM public.word_pools WHERE type = 'twist'
    ORDER BY random() LIMIT 1;
    IF v_word IS NOT NULL THEN
      v_prompt := v_prompt || ', ' || v_word;
    END IF;
  END IF;

  IF v_station.holiday IS NOT NULL THEN
    v_prompt := v_prompt || ', with a ' || v_station.holiday || ' theme';
  END IF;

  IF v_station.instrumental OR lower(v_genre) = 'classical' THEN
    v_prompt := v_prompt || ', instrumental, no vocals';
  END IF;

  -- Commission: the cron worker takes it from here -------------
  INSERT INTO public.songs
    (prompt, genre, mood, title, status, description, is_public,
     requested_by, commissioned_by, station_id, holiday)
  VALUES
    (v_prompt, lower(v_genre), v_mood,
     initcap(v_genre) || ' Session',
     'generating',
     'Commissioned for your station',
     true,
     NULL, auth.uid(), p_station, v_station.holiday)
  RETURNING id INTO v_song_id;

  RETURN v_song_id;
END;
$$;

-- ============================================================
-- library_genres: what can the dial tune to?
-- ============================================================
CREATE OR REPLACE FUNCTION public.library_genres()
RETURNS TABLE (genre text, n bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(s.genre) AS genre, count(*) AS n
  FROM public.songs s
  WHERE s.status = 'ready' AND s.is_public = true AND s.url IS NOT NULL
  GROUP BY lower(s.genre)
  ORDER BY n DESC;
$$;

-- Allow anonymous + authenticated execution of the listen-lane functions
GRANT EXECUTE ON FUNCTION public.next_track(uuid, text[], text, uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_feedback(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_track(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.library_genres() TO anon, authenticated;
