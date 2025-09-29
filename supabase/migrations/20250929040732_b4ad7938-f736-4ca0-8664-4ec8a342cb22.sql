-- Fix critical security issue: songs table is publicly readable
-- Add is_public field to allow users to control song visibility
ALTER TABLE public.songs ADD COLUMN is_public boolean DEFAULT false;

-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Public can view all songs" ON public.songs;

-- Create secure RLS policies

-- 1. Users can view their own songs (private and public)
CREATE POLICY "Users can view their own songs" 
ON public.songs 
FOR SELECT 
USING (auth.uid() = requested_by);

-- 2. Everyone can view songs marked as public
CREATE POLICY "Anyone can view public songs" 
ON public.songs 
FOR SELECT 
USING (is_public = true);

-- 3. Admins can view all songs (for management purposes)
CREATE POLICY "Admins can view all songs" 
ON public.songs 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. Update insert policy to ensure user can only create songs for themselves
DROP POLICY IF EXISTS "Users can insert their own songs" ON public.songs;
CREATE POLICY "Users can insert their own songs" 
ON public.songs 
FOR INSERT 
WITH CHECK (
  (current_setting('role'::text) = 'service_role'::text) OR 
  (requested_by = auth.uid()) OR 
  (requested_by IS NULL AND current_setting('role'::text) = 'service_role'::text)
);

-- 5. Update existing songs to be public (temporary measure to maintain functionality)
-- In production, you might want to make this opt-in instead
UPDATE public.songs 
SET is_public = true 
WHERE status = 'completed';

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_songs_is_public ON public.songs(is_public) WHERE is_public = true;