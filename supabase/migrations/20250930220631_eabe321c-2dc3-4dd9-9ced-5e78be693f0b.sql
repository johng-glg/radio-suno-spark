-- Add user_id column to queue table to make it user-specific
ALTER TABLE public.queue 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update existing queue items to have no user (will be cleaned up naturally)
-- New items will have user_id set

-- Drop old RLS policies
DROP POLICY IF EXISTS "Authenticated users can view queue" ON public.queue;
DROP POLICY IF EXISTS "Authenticated users can insert to queue" ON public.queue;
DROP POLICY IF EXISTS "Authenticated users can update queue" ON public.queue;
DROP POLICY IF EXISTS "Authenticated users can delete from queue" ON public.queue;

-- Create new user-specific RLS policies
CREATE POLICY "Users can view their own queue"
ON public.queue
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert to their own queue"
ON public.queue
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own queue"
ON public.queue
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete from their own queue"
ON public.queue
FOR DELETE
USING (auth.uid() = user_id);