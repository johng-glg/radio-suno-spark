import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

const LIVE_APP_URL = 'https://radio.jglab.dev';
const LEGACY_AUTH_HOSTS = ['lovableproject.com', 'lovable.app'];

function isLegacyTopLevelHost() {
  if (typeof window === 'undefined' || window.parent !== window) return false;
  return LEGACY_AUTH_HOSTS.some(
    (host) => window.location.hostname === host || window.location.hostname.endsWith(`.${host}`)
  );
}

function returnToLiveApp(session: Session) {
  const destination = new URL(window.location.pathname, LIVE_APP_URL);
  destination.search = window.location.search;
  // localStorage is isolated per domain. Carry the completed OAuth session in
  // the URL fragment so the live app's Supabase client can persist it there.
  // Fragments are not sent to servers or included in HTTP referrers.
  destination.hash = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: String(session.expires_in),
    expires_at: String(session.expires_at ?? ''),
    token_type: session.token_type,
  }).toString();
  window.location.replace(destination.toString());
}

function getAuthRedirectUrl() {
  // OAuth must never return to an editor or preview host. Those hosts route
  // auth callbacks through Lovable's own proxy instead of this application.
  return `${LIVE_APP_URL}/`;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session && isLegacyTopLevelHost()) {
          returnToLiveApp(session);
          return;
        }
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && isLegacyTopLevelHost()) {
        returnToLiveApp(session);
        return;
      }
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


  const signInWithGoogle = async () => {
    const redirectUrl = getAuthRedirectUrl();
    // Inside an iframe (Lovable preview), a normal redirect can navigate the
    // parent/editor instead of the app. Open the provider in a new tab instead.
    const framed = typeof window !== 'undefined' && window.parent !== window;

    if (framed) {
      // iOS only allows a new tab to be created synchronously from the tap.
      // Opening it after the OAuth request lets the Lovable shell intercept it.
      const authWindow = window.open('about:blank', '_blank');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        }
      });
      if (error) {
        authWindow?.close();
        return { error };
      }
      if (data?.url) {
        if (authWindow) {
          authWindow.opener = null;
          authWindow.location.replace(data.url);
        } else {
          window.location.assign(data.url);
        }
      }
      return { error: null };
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      }
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
    signInWithGoogle,
    signOut
  };
}