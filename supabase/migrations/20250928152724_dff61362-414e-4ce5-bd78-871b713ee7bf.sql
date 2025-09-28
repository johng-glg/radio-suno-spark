-- Update get_admin_stats to only count successful songs for totals and genre breakdowns
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
      WHERE status IN ('failed', 'resubmitted', 'resubmission_succeeded')
    ),
    'recent_failed_songs', (
      SELECT json_agg(json_build_object(
        'id', id,
        'title', title,
        'genre', genre,
        'created_at', created_at,
        'prompt', prompt,
        'status', status
      ))
      FROM (
        SELECT id, title, genre, created_at, prompt, status
        FROM public.songs
        WHERE status IN ('failed', 'resubmitted', 'resubmission_succeeded')
        ORDER BY created_at DESC
        LIMIT 20
      ) recent_fails
    )
  ) INTO stats;

  RETURN stats;
END;
$function$;