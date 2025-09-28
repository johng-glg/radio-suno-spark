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

  const makeUserAdmin = async (userId: string) => {
    if (!isAdmin) return { error: { message: 'Access denied' } };

    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: 'admin' });

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

      // Create a new song record for the resubmission first
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
        return { error: insertError };
      }

      // Mark the original song as resubmitted (preserve failed status for statistics)
      const { error: updateError } = await supabase
        .from('songs')
        .update({ 
          resubmitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', songId);

      if (updateError) {
        // If marking as resubmitted fails, clean up the new song
        await supabase
          .from('songs')
          .delete()
          .eq('id', newSong.id);
        
        return { error: updateError };
      }

      return { error: null, newSongId: newSong.id };
    } catch (error) {
      return { error };
    }
  };

  const checkSongStatus = async (songId: string) => {
    try {
      const { data, error } = await supabase
        .from('songs')
        .select('id, status, title, created_at, updated_at, resubmitted_at, resubmission_succeeded_at, original_song_id')
        .eq('id', songId)
        .single();

      if (error) throw error;

      return { data, error: null };
    } catch (error: any) {
      console.error('Error checking song status:', error);
      return { data: null, error };
    }
  };

  return {
    isAdmin,
    loading,
    getAdminStats,
    makeUserAdmin,
    resubmitFailedSong,
    checkSongStatus
  };
}