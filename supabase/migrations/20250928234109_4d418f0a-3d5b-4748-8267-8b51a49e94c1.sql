-- Add generate_when_exhausted preference field to user_preferences table
ALTER TABLE public.user_preferences 
ADD COLUMN generate_when_exhausted boolean DEFAULT true;