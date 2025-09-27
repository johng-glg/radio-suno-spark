import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface GenerateMusicParams {
  prompt: string;
  genre: string;
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
  error?: string;
}

export function useMusicGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const generateMusic = async (params: GenerateMusicParams): Promise<GeneratedMusic | null> => {
    setIsGenerating(true);
    
    try {
      console.log('Generating music with params:', params);
      
      const { data, error } = await supabase.functions.invoke('generate-music', {
        body: params
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

      toast({
        title: "Music Generated!",
        description: `${result.title || 'Track'} has been added to your queue`,
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

  return {
    generateMusic,
    isGenerating
  };
}