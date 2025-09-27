import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface GenerateMusicParams {
  // New Build Prompt system
  use_build_prompt?: boolean;
  wild_card_mode?: boolean;
  
  // Legacy parameters for backwards compatibility
  prompt?: string;
  genre?: string;
  mood?: string;
  title?: string;
  make_instrumental?: boolean;
}

interface GeneratedMusic {
  success: boolean;
  song_id?: string;
  suno_id?: string;
  status?: string;
  audio_url?: string;
  title?: string;
  prompt?: string;
  prompt_metadata?: {
    template_used?: string;
    selected_words?: Record<string, string>;
    wild_card_applied?: boolean;
  };
  demo_mode?: boolean;
  error?: string;
}

export function useMusicGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const generateMusic = async (params: GenerateMusicParams): Promise<GeneratedMusic | null> => {
    setIsGenerating(true);
    
    try {
      console.log('Generating music with params:', params);
      
      const requestBody = {
        user_id: user?.id,
        use_build_prompt: params.use_build_prompt ?? true,
        wild_card_mode: params.wild_card_mode ?? false,
        ...params
      };

      const { data, error } = await supabase.functions.invoke('generate-music', {
        body: requestBody
      });

      if (error) {
        console.error('Supabase function error:', error);
        toast({
          title: "Generation Failed",
          description: `Failed to generate music: ${error.message}`,
          variant: "destructive",
        });
        return null;
      }

      const result = data as GeneratedMusic;
      
      if (!result.success) {
        toast({
          title: "Generation Failed",
          description: result.error || "Unknown error occurred",
          variant: "destructive",
        });
        return result;
      }

      let description = `${result.title || 'Track'} has been generated`;
      if (result.prompt_metadata?.wild_card_applied) {
        description += ' with a wild card twist!';
      }

      toast({
        title: result.status === 'ready' ? 'Music Generated!' : 'Generating Music',
        description,
      });

      return result;
      
    } catch (err) {
      console.error('Music generation error:', err);
      toast({
        title: "Generation Failed",
        description: "Failed to generate music. Please try again.",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  // Generate music using the new Build Prompt system
  const generateWithBuildPrompt = async (wildCardMode = false) => {
    return generateMusic({
      use_build_prompt: true,
      wild_card_mode: wildCardMode
    });
  };

  // Keep the legacy method for backwards compatibility
  const generateMusicLegacy = async (prompt: string, genre: string, mood?: string, title?: string) => {
    return generateMusic({
      use_build_prompt: false,
      prompt,
      genre,
      mood,
      title
    });
  };

  return {
    generateMusic,
    generateWithBuildPrompt,
    generateMusicLegacy,
    isGenerating
  };
}