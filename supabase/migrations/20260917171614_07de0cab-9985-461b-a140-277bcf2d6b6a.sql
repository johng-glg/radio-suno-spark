ALTER TABLE public.songs ADD COLUMN IF NOT EXISTS storage_path text;

CREATE POLICY "Anyone can read song audio"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'song-audio');

CREATE POLICY "Service role manages song audio"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'song-audio')
WITH CHECK (bucket_id = 'song-audio');