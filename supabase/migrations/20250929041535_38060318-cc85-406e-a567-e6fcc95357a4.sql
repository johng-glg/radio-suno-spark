-- Update get_admin_stats to treat 'ready' songs as successful and set search_path
CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    stats jsonb;
    user_list jsonb;
    recent_failed_songs jsonb;
    recent_songs jsonb;
    top_songs jsonb;
    total_users int;
    total_profiles int;
    total_successful_songs int;
    failed_generations int;
    songs_by_genre jsonb;
    songs_by_status jsonb;
BEGIN
    -- Check if the user has admin role
    IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Get total users count
    SELECT COUNT(*)::int INTO total_users
    FROM auth.users;

    -- Get total profiles count  
    SELECT COUNT(*)::int INTO total_profiles
    FROM public.profiles;

    -- Get total successful songs (treat 'ready' as successful, include 'completed' if present)
    SELECT COUNT(*)::int INTO total_successful_songs
    FROM public.songs
    WHERE status IN ('ready','completed');

    -- Get failed generations count
    SELECT COUNT(*)::int INTO failed_generations
    FROM public.songs
    WHERE status = 'failed';

    -- Get songs by genre (only successful)
    SELECT jsonb_object_agg(genre, count) INTO songs_by_genre
    FROM (
        SELECT genre, COUNT(*)::int AS count
        FROM public.songs
        WHERE status IN ('ready','completed')
        GROUP BY genre
    ) subq;

    -- Get songs by status
    SELECT jsonb_object_agg(status, count) INTO songs_by_status
    FROM (
        SELECT status, COUNT(*)::int AS count
        FROM public.songs
        GROUP BY status
    ) subq;

    -- Get user list with roles
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', u.id,
            'email', u.email,
            'display_name', COALESCE(p.display_name, u.email),
            'created_at', u.created_at,
            'last_sign_in_at', u.last_sign_in_at,
            'role', COALESCE(ur.role, 'user')
        )
        ORDER BY u.created_at DESC
    ) INTO user_list
    FROM auth.users u
    LEFT JOIN public.profiles p ON u.id = p.id
    LEFT JOIN public.user_roles ur ON u.id = ur.user_id;

    -- Get recent failed songs
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', t.id,
            'title', t.title,
            'genre', t.genre,
            'created_at', t.created_at,
            'prompt', t.prompt,
            'status', t.status,
            'resubmitted_at', t.resubmitted_at,
            'resubmission_succeeded_at', t.resubmission_succeeded_at
        )
        ORDER BY t.created_at DESC
    ) INTO recent_failed_songs
    FROM (
        SELECT s.id, s.title, s.genre, s.created_at, s.prompt, s.status, s.resubmitted_at, s.resubmission_succeeded_at
        FROM public.songs s
        WHERE s.status = 'failed'
        ORDER BY s.created_at DESC
        LIMIT 50
    ) t;

    -- Get 10 most recent songs (any status)
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', t.id,
            'title', t.title,
            'genre', t.genre,
            'mood', t.mood,
            'created_at', t.created_at,
            'status', t.status,
            'url', t.url,
            'image_url', t.image_url
        )
        ORDER BY t.created_at DESC
    ) INTO recent_songs
    FROM (
        SELECT s.id, s.title, s.genre, s.mood, s.created_at, s.status, s.url, s.image_url
        FROM public.songs s
        ORDER BY s.created_at DESC
        LIMIT 10
    ) t;

    -- Get top songs with play counts and like counts (only successful)
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', song_stats.id,
            'title', song_stats.title,
            'genre', song_stats.genre,
            'mood', song_stats.mood,
            'created_at', song_stats.created_at,
            'likes_count', song_stats.likes_count,
            'total_plays', song_stats.total_plays
        )
        ORDER BY song_stats.likes_count DESC, song_stats.total_plays DESC
    ) INTO top_songs
    FROM (
        SELECT 
            s.id,
            s.title,
            s.genre,
            s.mood,
            s.created_at,
            COALESCE(like_counts.likes_count, 0) as likes_count,
            COALESCE(play_counts.total_plays, 0) as total_plays
        FROM public.songs s
        LEFT JOIN (
            SELECT 
                song_id, 
                COUNT(*) as likes_count
            FROM public.user_song_interactions 
            WHERE interaction_type = 'like'
            GROUP BY song_id
        ) like_counts ON s.id = like_counts.song_id
        LEFT JOIN (
            SELECT 
                song_id, 
                SUM(play_count) as total_plays
            FROM public.user_song_plays 
            GROUP BY song_id
        ) play_counts ON s.id = play_counts.song_id
        WHERE s.status IN ('ready','completed')
        ORDER BY likes_count DESC, total_plays DESC
        LIMIT 10
    ) song_stats;

    -- Build the final stats object
    stats := jsonb_build_object(
        'total_users', total_users,
        'total_profiles', total_profiles,
        'total_successful_songs', total_successful_songs,
        'failed_generations', failed_generations,
        'songs_by_genre', COALESCE(songs_by_genre, '{}'::jsonb),
        'songs_by_status', COALESCE(songs_by_status, '{}'::jsonb),
        'user_list', COALESCE(user_list, '[]'::jsonb),
        'recent_failed_songs', COALESCE(recent_failed_songs, '[]'::jsonb),
        'recent_songs', COALESCE(recent_songs, '[]'::jsonb),
        'top_songs', COALESCE(top_songs, '[]'::jsonb)
    );

    RETURN stats;
END;
$$;