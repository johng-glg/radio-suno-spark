-- SECURITY FIX: Remove email addresses from profiles table
-- Email addresses should only exist in auth.users (not exposed via API)

-- Remove email column from profiles table
ALTER TABLE public.profiles DROP COLUMN IF EXISTS email;

-- Create a secure function to get current user's email when needed
-- This ensures only the authenticated user can access their own email
CREATE OR REPLACE FUNCTION public.get_current_user_email()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT email FROM auth.users WHERE id = auth.uid()
$$;

-- Update the handle_new_user function to not include email in profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

-- Add comment documenting security decision
COMMENT ON TABLE public.profiles IS 'User profile data. Email addresses are NOT stored here for security - use get_current_user_email() function to access authenticated user email when needed.';