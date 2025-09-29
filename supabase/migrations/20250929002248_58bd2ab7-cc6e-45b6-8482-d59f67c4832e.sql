-- Fix RLS policy for song generation from edge functions
-- The current policies don't allow the service role to insert songs on behalf of users

-- Drop the existing policies that are too restrictive
DROP POLICY IF EXISTS "Authenticated users can request songs" ON public.songs;
DROP POLICY IF EXISTS "Anonymous users can request limited songs" ON public.songs;

-- Create new policies that allow edge functions to work properly
CREATE POLICY "Users can insert their own songs" 
ON public.songs 
FOR INSERT 
WITH CHECK (
  -- Allow service role to insert songs (for edge functions)
  current_setting('role') = 'service_role' 
  OR 
  -- Allow authenticated users to insert their own songs
  (requested_by = auth.uid())
  OR 
  -- Allow anonymous songs (requested_by IS NULL)
  (requested_by IS NULL)
);

-- Create policy for system and edge function updates
CREATE POLICY "System can update songs" 
ON public.songs 
FOR UPDATE 
USING (
  -- Service role can update any song (for edge functions)
  current_setting('role') = 'service_role'
  OR 
  -- Users can update their own songs
  (requested_by IS NOT NULL AND requested_by = auth.uid())
  OR 
  -- Allow updates to anonymous songs by service role
  (requested_by IS NULL AND current_setting('role') = 'service_role')
)
WITH CHECK (
  -- Service role can update any song
  current_setting('role') = 'service_role'
  OR 
  -- Users can update their own songs  
  (requested_by IS NOT NULL AND requested_by = auth.uid())
  OR 
  -- Allow updates to anonymous songs by service role
  (requested_by IS NULL AND current_setting('role') = 'service_role')
);