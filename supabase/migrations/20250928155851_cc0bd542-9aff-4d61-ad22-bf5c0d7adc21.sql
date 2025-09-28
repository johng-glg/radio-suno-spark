-- Enable realtime for songs table
ALTER TABLE public.songs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.songs;