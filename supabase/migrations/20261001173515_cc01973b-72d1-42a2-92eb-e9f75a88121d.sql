INSERT INTO public.word_pools (type, value, weight)
VALUES ('genre', 'brasscore', 1)
ON CONFLICT DO NOTHING;