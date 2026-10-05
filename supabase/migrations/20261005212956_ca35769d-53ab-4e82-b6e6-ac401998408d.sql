CREATE OR REPLACE FUNCTION public.get_admin_stats()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
    stats jsonb; user_list jsonb; recent_failed_songs jsonb; recent_songs jsonb; top_songs jsonb;
    library_overview jsonb; total_users int; total_profiles int; total_successful_songs int;
    failed_generations int; songs_by_genre jsonb; songs_by_status jsonb;
BEGIN
    IF NOT has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Access denied'; END IF;
    SELECT COUNT(*)::int INTO total_users FROM auth.users;
    SELECT COUNT(*)::int INTO total_profiles FROM public.profiles;
    SELECT COUNT(*)::int INTO total_successful_songs FROM public.songs WHERE status IN ('ready','completed');
    SELECT COUNT(*)::int INTO failed_generations FROM public.songs WHERE status = 'failed';
    SELECT jsonb_object_agg(genre, count) INTO songs_by_genre FROM (
        SELECT genre, COUNT(*)::int AS count FROM public.songs WHERE status IN ('ready','completed') GROUP BY genre) subq;
    SELECT jsonb_object_agg(status, count) INTO songs_by_status FROM (
        SELECT status, COUNT(*)::int AS count FROM public.songs GROUP BY status) subq;
    SELECT jsonb_agg(jsonb_build_object('id', u.id,'email', u.email,'display_name', COALESCE(p.display_name, u.email),
        'created_at', u.created_at,'last_sign_in_at', u.last_sign_in_at,'role', COALESCE(ur.role, 'user')) ORDER BY u.created_at DESC)
    INTO user_list FROM auth.users u LEFT JOIN public.profiles p ON u.id = p.id LEFT JOIN public.user_roles ur ON u.id = ur.user_id;
    SELECT jsonb_agg(jsonb_build_object('id', t.id,'title', t.title,'genre', t.genre,'created_at', t.created_at,'prompt', t.prompt,
        'status', t.status,'resubmitted_at', t.resubmitted_at,'resubmission_succeeded_at', t.resubmission_succeeded_at) ORDER BY t.created_at DESC)
    INTO recent_failed_songs FROM (
        SELECT s.id, s.title, s.genre, s.created_at, s.prompt, s.status, s.resubmitted_at, s.resubmission_succeeded_at
        FROM public.songs s WHERE s.status = 'failed' ORDER BY s.created_at DESC LIMIT 50) t;
    SELECT jsonb_agg(jsonb_build_object('id', t.id,'title', t.title,'genre', t.genre,'mood', t.mood,'created_at', t.created_at,
        'status', t.status,'url', t.url,'image_url', t.image_url) ORDER BY t.created_at DESC)
    INTO recent_songs FROM (
        SELECT s.id, s.title, s.genre, s.mood, s.created_at, s.status, s.url, s.image_url
        FROM public.songs s ORDER BY s.created_at DESC LIMIT 10) t;
    SELECT jsonb_agg(jsonb_build_object('id', ss.id,'title', ss.title,'genre', ss.genre,'mood', ss.mood,'created_at', ss.created_at,
        'likes_count', ss.likes_count,'total_plays', ss.total_plays) ORDER BY ss.total_plays DESC, ss.likes_count DESC)
    INTO top_songs FROM (
        SELECT s.id, s.title, s.genre, s.mood, s.created_at,
            COALESCE(lc.likes_count, 0) as likes_count, COALESCE(pc.total_plays, 0) as total_plays
        FROM public.songs s
        LEFT JOIN (SELECT song_id, COUNT(*) as likes_count FROM public.user_song_interactions WHERE interaction_type = 'like' GROUP BY song_id) lc ON s.id = lc.song_id
        LEFT JOIN (SELECT song_id, SUM(play_count) as total_plays FROM public.user_song_plays GROUP BY song_id) pc ON s.id = pc.song_id
        WHERE s.status IN ('ready','completed') ORDER BY s.created_at DESC LIMIT 200) ss;
    WITH all_genres AS (
        SELECT DISTINCT genre FROM (
          SELECT unnest(ARRAY['brasscore','classical','country','edm','hip-hop','jazz','pop','rock']) AS genre
          UNION SELECT lower(value) FROM public.word_pools WHERE type = 'genre'
          UNION SELECT lower(genre) FROM public.songs WHERE is_public = true AND status IN ('ready','completed')
        ) g
    ),
    all_moods AS (SELECT unnest(ARRAY['upbeat','chill','aggressive','emotional','epic','playful']) AS mood),
    all_combinations AS (SELECT g.genre, m.mood FROM all_genres g CROSS JOIN all_moods m),
    library_counts AS (
        SELECT LOWER(s.genre) as genre, LOWER(s.mood) as mood, COUNT(*) as count
        FROM public.songs s WHERE s.is_public = true AND s.status IN ('ready','completed')
        GROUP BY LOWER(s.genre), LOWER(s.mood))
    SELECT jsonb_agg(jsonb_build_object('genre', ac.genre,'mood', ac.mood,'count', COALESCE(lc.count, 0)) ORDER BY ac.genre, ac.mood)
    INTO library_overview FROM all_combinations ac
    LEFT JOIN library_counts lc ON ac.genre = lc.genre AND ac.mood = lc.mood;
    stats := jsonb_build_object('total_users', total_users,'total_profiles', total_profiles,
        'total_successful_songs', total_successful_songs,'failed_generations', failed_generations,
        'songs_by_genre', COALESCE(songs_by_genre, '{}'::jsonb),'songs_by_status', COALESCE(songs_by_status, '{}'::jsonb),
        'user_list', COALESCE(user_list, '[]'::jsonb),'recent_failed_songs', COALESCE(recent_failed_songs, '[]'::jsonb),
        'recent_songs', COALESCE(recent_songs, '[]'::jsonb),'top_songs', COALESCE(top_songs, '[]'::jsonb),
        'library_overview', COALESCE(library_overview, '[]'::jsonb));
    RETURN stats;
END;
$function$;