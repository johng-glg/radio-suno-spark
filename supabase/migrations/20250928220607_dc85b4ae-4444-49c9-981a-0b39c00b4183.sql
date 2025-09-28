-- Fix get_admin_stats ordering by moving ORDER BY into json_agg and limiting rows in a subquery
CREATE OR REPLACE FUNCTION public.get_admin_stats()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  stats json;
BEGIN
  -- Check if user is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin role required.';
  END IF;

  SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM auth.users),
    'total_profiles', (SELECT COUNT(*) FROM public.profiles),
    'total_successful_songs', (
      SELECT COUNT(*) 
      FROM public.songs 
      WHERE status = 'ready'
    ),
    'songs_by_genre', (
      SELECT json_object_agg(genre, song_count)
      FROM (
        SELECT genre, COUNT(*) as song_count
        FROM public.songs
        WHERE status = 'ready'
        GROUP BY genre
        ORDER BY song_count DESC
      ) genre_stats
    ),
    'songs_by_status', (
      SELECT json_object_agg(status, status_count)
      FROM (
        SELECT status, COUNT(*) as status_count
        FROM public.songs
        GROUP BY status
      ) status_stats
    ),
    'failed_generations', (
      SELECT COUNT(*)
      FROM public.songs
      WHERE status = 'failed'
    ),
    'user_list', (
      SELECT json_agg(user_data ORDER BY created_at DESC)
      FROM (
        SELECT json_build_object(
          'id', u.id,
          'email', u.email,
          'display_name', COALESCE(p.display_name, u.email),
          'created_at', u.created_at,
          'last_sign_in_at', u.last_sign_in_at,
          'role', COALESCE(ur.role, 'user'::app_role)
        ) as user_data,
        u.created_at
        FROM auth.users u
        LEFT JOIN public.profiles p ON u.id = p.id
        LEFT JOIN public.user_roles ur ON u.id = ur.user_id
      ) user_list_subquery
    ),
    'recent_failed_songs', (
      SELECT json_agg(json_build_object(
        'id', id,
        'title', title,
        'genre', genre,
        'created_at', created_at,
        'prompt', prompt,
        'status', status,
        'resubmitted_at', resubmitted_at,
        'resubmission_succeeded_at', resubmission_succeeded_at
      ) ORDER BY created_at DESC)
      FROM (
        SELECT id, title, genre, created_at, prompt, status, resubmitted_at, resubmission_succeeded_at
        FROM public.songs
        WHERE status = 'failed'
        ORDER BY created_at DESC
        LIMIT 20
      ) recent_fails
    ),
    'top_songs', (
      WITH song_likes AS (
        SELECT 
          song_id,
          COUNT(*) as likes_count
        FROM public.user_song_interactions
        WHERE interaction_type = 'like'
        GROUP BY song_id
      ),
      song_plays AS (
        SELECT 
          song_id,
          SUM(play_count) as total_plays
        FROM public.user_song_plays
        GROUP BY song_id
      ),
      ranked AS (
        SELECT 
          s.id,
          s.title,
          s.genre,
          s.created_at,
          COALESCE(sl.likes_count, 0) AS likes_count,
          COALESCE(sp.total_plays, 0) AS total_plays,
          (COALESCE(sl.likes_count, 0) + COALESCE(sp.total_plays, 0)) AS score
        FROM public.songs s
        LEFT JOIN song_likes sl ON s.id = sl.song_id
        LEFT JOIN song_plays sp ON s.id = sp.song_id
        WHERE s.status = 'ready'
          AND (
            COALESCE(sl.likes_count, 0) > 0 OR COALESCE(sp.total_plays, 0) > 0
          )
        ORDER BY score DESC
        LIMIT 50
      )
      SELECT json_agg(
        json_build_object(
          'id', r.id,
          'title', r.title,
          'genre', r.genre,
          'created_at', r.created_at,
          'likes_count', r.likes_count,
          'total_plays', r.total_plays
        ) ORDER BY r.score DESC
      )
      FROM ranked r
    )
  ) INTO stats;

  RETURN stats;
END;
$function$;