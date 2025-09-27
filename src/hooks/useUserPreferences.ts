import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface UserPreferences {
  excluded_moods: string[];
  excluded_instruments: string[];
  wild_card_mode: boolean;
}

const defaultPreferences: UserPreferences = {
  excluded_moods: [],
  excluded_instruments: [],
  wild_card_mode: false
};

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  // Load user preferences on mount
  useEffect(() => {
    if (user) {
      loadPreferences();
    } else {
      setPreferences(defaultPreferences);
      setLoading(false);
    }
  }, [user]);

  const loadPreferences = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_preferences')
        .select('excluded_moods, excluded_instruments, wild_card_mode')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error loading preferences:', error);
        return;
      }

      if (data) {
        setPreferences(data);
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const updatePreferences = async (newPreferences: Partial<UserPreferences>) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to save preferences",
        variant: "destructive"
      });
      return;
    }

    try {
      const updatedPreferences = { ...preferences, ...newPreferences };

      const { error } = await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: user.id,
            ...updatedPreferences
          },
          { onConflict: 'user_id' }
        );

      if (error) {
        console.error('Error updating preferences:', error);
        toast({
          title: "Error",
          description: "Failed to save preferences",
          variant: "destructive"
        });
        return;
      }

      setPreferences(updatedPreferences);
      toast({
        title: "Preferences Saved",
        description: "Your preferences have been updated"
      });
    } catch (error) {
      console.error('Error updating preferences:', error);
      toast({
        title: "Error",
        description: "Failed to save preferences",
        variant: "destructive"
      });
    }
  };

  const toggleWildCardMode = () => {
    updatePreferences({ wild_card_mode: !preferences.wild_card_mode });
  };

  const addExclusion = (type: 'mood' | 'instrument', value: string) => {
    const exclusionKey = type === 'mood' ? 'excluded_moods' : 'excluded_instruments';
    const currentExclusions = preferences[exclusionKey];
    
    if (!currentExclusions.includes(value)) {
      updatePreferences({
        [exclusionKey]: [...currentExclusions, value]
      });
    }
  };

  const removeExclusion = (type: 'mood' | 'instrument', value: string) => {
    const exclusionKey = type === 'mood' ? 'excluded_moods' : 'excluded_instruments';
    const currentExclusions = preferences[exclusionKey];
    
    updatePreferences({
      [exclusionKey]: currentExclusions.filter(item => item !== value)
    });
  };

  return {
    preferences,
    loading,
    updatePreferences,
    toggleWildCardMode,
    addExclusion,
    removeExclusion
  };
}