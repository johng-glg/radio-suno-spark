import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, displayName?: string) => {
    // Enhanced input validation
    if (!email || email.length > 255) {
      return { error: { message: 'Invalid email address' } };
    }
    if (!password || password.length < 8) {
      return { error: { message: 'Password must be at least 8 characters long' } };
    }
    if (displayName && displayName.length > 100) {
      return { error: { message: 'Display name must be less than 100 characters' } };
    }

    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          display_name: displayName?.trim()
        }
      }
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    // Enhanced input validation
    if (!email || email.length > 255) {
      return { error: { message: 'Invalid email address' } };
    }
    if (!password) {
      return { error: { message: 'Password is required' } };
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    });
    return { error };
  };


  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  return {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut
  };
}