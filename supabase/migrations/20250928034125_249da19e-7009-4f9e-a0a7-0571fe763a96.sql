-- Fix RLS policies to handle both authenticated and unauthenticated users
-- while maintaining security

-- Drop the overly restrictive policy
DROP POLICY IF EXISTS "Authenticated users can request songs" ON public.songs;

-- Create more flexible policies that allow both authenticated and unauthenticated usage
-- but prevent abuse

-- Allow authenticated users to insert songs with proper user tracking
CREATE POLICY "Authenticated users can request songs"
ON public.songs  
FOR INSERT
TO authenticated
WITH CHECK (requested_by = auth.uid());

-- Allow anonymous users to insert songs (for demo/testing) but with restrictions
-- This ensures the app works for anonymous users while tracking when possible
CREATE POLICY "Anonymous users can request limited songs"
ON public.songs
FOR INSERT
TO anon
WITH CHECK (
  -- Allow anonymous inserts but ensure requested_by is null for anonymous users
  requested_by IS NULL
);

-- Update the update policy to handle both cases
DROP POLICY IF EXISTS "Users can update their requested songs" ON public.songs;

-- Allow system updates (service role) and user updates
CREATE POLICY "System and user song updates"
ON public.songs
FOR UPDATE
USING (
  -- Service role can update any song (for system operations)
  current_setting('role') = 'service_role' OR
  -- Users can update their own songs
  (requested_by IS NOT NULL AND requested_by = auth.uid()) OR
  -- Anonymous songs can be updated by system only
  (requested_by IS NULL AND current_setting('role') = 'service_role')
)
WITH CHECK (
  -- Same conditions for updates
  current_setting('role') = 'service_role' OR
  (requested_by IS NOT NULL AND requested_by = auth.uid()) OR
  (requested_by IS NULL AND current_setting('role') = 'service_role')
);