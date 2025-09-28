-- Update the get_admin_stats function to include top 10 songs by likes
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
      ))
      FROM (
        SELECT id, title, genre, created_at, prompt, status, resubmitted_at, resubmission_succeeded_at
        FROM public.songs
        WHERE status = 'failed'
        ORDER BY created_at DESC
        LIMIT 20
      ) recent_fails
    ),
    'top_songs_by_likes', (
      SELECT json_agg(json_build_object(
        'id', s.id,
        'title', s.title,
        'genre', s.genre,
        'created_at', s.created_at,
        'likes_count', COALESCE(likes_data.likes_count, 0)
      ))
      FROM public.songs s
      LEFT JOIN (
        SELECT 
          song_id,
          COUNT(*) as likes_count
        FROM public.user_song_interactions
        WHERE interaction_type = 'like'
        GROUP BY song_id
      ) likes_data ON s.id = likes_data.song_id
      WHERE s.status = 'ready'
      ORDER BY COALESCE(likes_data.likes_count, 0) DESC
      LIMIT 10
    )
  ) INTO stats;

  RETURN stats;
END;
$function$;