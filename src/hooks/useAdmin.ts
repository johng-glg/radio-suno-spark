import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait for auth state to resolve to avoid premature redirects
    if (authLoading) return;

    const checkAdminStatus = async () => {
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();

        if (error) {
          console.error('Error checking admin status:', error);
          setIsAdmin(false);
        } else {
          setIsAdmin(!!data);
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdminStatus();
  }, [user, authLoading]);

  const getAdminStats = async () => {
    if (!isAdmin) return null;

    try {
      const { data, error } = await supabase.rpc('get_admin_stats');
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching admin stats:', error);
      return null;
    }
  };

  const makeUserAdmin = async (email: string) => {
    if (!isAdmin) return { error: { message: 'Access denied' } };

    try {
      // First get the user ID from email
      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('id')
        .ilike('display_name', `%${email}%`)
        .maybeSingle();

      if (userError || !userData) {
        return { error: { message: 'User not found' } };
      }

      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userData.id, role: 'admin' });

      return { error };
    } catch (error) {
      return { error };
    }
  };

  const resubmitFailedSong = async (songId: string) => {
    if (!isAdmin) return { error: { message: 'Access denied' } };

    try {
      // First, get the original failed song data
      const { data: originalSong, error: fetchError } = await supabase
        .from('songs')
        .select('*')
        .eq('id', songId)
        .eq('status', 'failed')
        .single();

      if (fetchError || !originalSong) {
        return { error: { message: 'Failed song not found' } };
      }

      // Mark the original song as resubmitted for tracking
      const { error: updateError } = await supabase
        .from('songs')
        .update({ 
          status: 'resubmitted',
          updated_at: new Date().toISOString()
        })
        .eq('id', songId);

      if (updateError) {
        return { error: updateError };
      }

      // Create a new song record for the resubmission
      // Use the current admin user as requester to avoid RLS issues
      const { data: newSong, error: insertError } = await supabase
        .from('songs')
        .insert({
          title: originalSong.title,
          prompt: originalSong.prompt,
          genre: originalSong.genre,
          mood: originalSong.mood,
          requested_by: user?.id || null, // Use admin's ID to satisfy RLS
          status: 'generating',
          original_song_id: songId  // Link back to original failed song
        })
        .select()
        .single();

      if (insertError) {
        // Rollback the original song status if new song creation fails
        await supabase
          .from('songs')
          .update({ status: 'failed' })
          .eq('id', songId);
        
        return { error: insertError };
      }

      return { error: null, newSongId: newSong.id };
    } catch (error) {
      return { error };
    }
  };

  return {
    isAdmin,
    loading,
    getAdminStats,
    makeUserAdmin,
    resubmitFailedSong
  };
}