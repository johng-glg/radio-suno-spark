-- Security fixes for queue access
DROP POLICY IF EXISTS "Anyone can manage queue" ON public.queue;
DROP POLICY IF EXISTS "Anyone can view queue" ON public.queue;

-- Restrict queue access to authenticated users only
CREATE POLICY "Authenticated users can view queue" 
ON public.queue 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert to queue" 
ON public.queue 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update queue" 
ON public.queue 
FOR UPDATE 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete from queue" 
ON public.queue 
FOR DELETE 
TO authenticated
USING (true);

-- Security fixes for content generation tables
-- Restrict prompt_pools to admin-only inserts (keeping read access public for generation)
DROP POLICY IF EXISTS "Anyone can insert prompt pools" ON public.prompt_pools;

CREATE POLICY "Service role can insert prompt pools" 
ON public.prompt_pools 
FOR INSERT 
TO service_role
WITH CHECK (true);

-- Restrict prompt_templates to admin-only inserts
DROP POLICY IF EXISTS "Anyone can insert prompt templates" ON public.prompt_templates;

CREATE POLICY "Service role can insert prompt templates" 
ON public.prompt_templates 
FOR INSERT 
TO service_role
WITH CHECK (true);

-- Restrict word_pools to admin-only inserts
DROP POLICY IF EXISTS "Anyone can insert word pools" ON public.word_pools;

CREATE POLICY "Service role can insert word pools" 
ON public.word_pools 
FOR INSERT 
TO service_role
WITH CHECK (true);

-- Add rate limiting table for authentication attempts
CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address inet NOT NULL,
    attempt_count integer DEFAULT 1,
    last_attempt timestamptz DEFAULT now(),
    blocked_until timestamptz,
    created_at timestamptz DEFAULT now()
);

-- Enable RLS on rate limits table
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can manage rate limits
CREATE POLICY "Service role can manage rate limits" 
ON public.auth_rate_limits 
FOR ALL 
TO service_role
USING (true)
WITH CHECK (true);