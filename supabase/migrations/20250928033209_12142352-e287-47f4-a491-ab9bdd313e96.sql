-- SECURITY FIX: Secure songs table access control
-- This fixes the critical vulnerability where anyone could modify music content

-- First, add user tracking to songs for better security and auditing
ALTER TABLE public.songs 
ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add comment explaining the user tracking
COMMENT ON COLUMN public.songs.requested_by IS 'User who requested this song generation (for auditing), songs remain publicly accessible';

-- Drop the overly permissive existing policies
DROP POLICY IF EXISTS "Anyone can insert songs" ON public.songs;
DROP POLICY IF EXISTS "Anyone can update songs" ON public.songs; 
DROP POLICY IF EXISTS "Anyone can view songs" ON public.songs;

-- Create secure, role-based policies

-- 1. SELECT: Keep public for music streaming (songs are publicly accessible)
CREATE POLICY "Public can view all songs"
ON public.songs
FOR SELECT
USING (true);

-- 2. INSERT: Only authenticated users can request song generation
-- This prevents anonymous spam/abuse while allowing legitimate users to generate music
CREATE POLICY "Authenticated users can request songs"
ON public.songs  
FOR INSERT
TO authenticated
WITH CHECK (requested_by = auth.uid());

-- 3. UPDATE: Restrict to system functions and song owners
-- Most updates should be done by edge functions, but allow users to update their own requests
CREATE POLICY "Users can update their requested songs"
ON public.songs
FOR UPDATE  
TO authenticated
USING (requested_by = auth.uid())
WITH CHECK (requested_by = auth.uid());

-- 4. DELETE: Highly restricted - only for cleanup/moderation
CREATE POLICY "Users can delete their requested songs"
ON public.songs
FOR DELETE
TO authenticated  
USING (requested_by = auth.uid());

-- Create a secure function for system-level song updates (used by edge functions)
CREATE OR REPLACE FUNCTION public.system_update_song(
  song_id UUID,
  update_data JSONB
) 
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_fields TEXT[] := ARRAY['status', 'url', 'title', 'description', 'image_url', 'suno_id', 'updated_at'];
  field_name TEXT;
  field_value TEXT;
BEGIN
  -- Validate that only allowed fields are being updated
  FOR field_name IN SELECT jsonb_object_keys(update_data) LOOP
    IF field_name != ANY(allowed_fields) THEN
      RAISE EXCEPTION 'Field % is not allowed for system updates', field_name;
    END IF;
  END LOOP;
  
  -- Perform the update
  EXECUTE format(
    'UPDATE public.songs SET %s WHERE id = $1',
    (
      SELECT string_agg(
        format('%I = ($2->>%L)::%s', 
          key, 
          key,
          CASE 
            WHEN key IN ('updated_at') THEN 'timestamptz'
            ELSE 'text'
          END
        ), 
        ', '
      )
      FROM jsonb_object_keys(update_data) AS key
    )
  ) USING song_id, update_data;
  
  RETURN FOUND;
END;
$$;

-- Grant execute permission to service role for edge functions
GRANT EXECUTE ON FUNCTION public.system_update_song(UUID, JSONB) TO service_role;