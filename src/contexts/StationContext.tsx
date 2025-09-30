import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAudioPlayer } from './AudioContext';
import { useMusicGeneration } from '@/hooks/useMusicGeneration';
import { useToast } from '@/hooks/use-toast';

interface Song {
  id: string;
  title: string;
  description?: string;
  genre: string;
  mood?: string;
  url?: string;
  image_url?: string;
  status: 'generating' | 'ready' | 'failed';
  holiday?: string | null;
}

interface StationSettings {
  genres: string[];
  mood?: string;
  instrumental: boolean;
  wildcard: boolean;
  holiday?: string;
}

interface StationContextType {
  isStationActive: boolean;
  queue: Song[];
  stationSettings: StationSettings | null;
  startStation: (settings: StationSettings) => Promise<void>;
  stopStation: () => void;
  skipToNext: () => Promise<void>;
  refreshQueue: () => Promise<void>;
}

const StationContext = createContext<StationContextType | undefined>(undefined);

export function StationProvider({ children }: { children: ReactNode }) {
  const [isStationActive, setIsStationActive] = useState(false);
  const [queue, setQueue] = useState<Song[]>([]);
  const [stationSettings, setStationSettings] = useState<StationSettings | null>(null);
  
  const { playSong, stop: stopAudio, currentSong } = useAudioPlayer();
  const { generateWithBuildPrompt, isGenerating } = useMusicGeneration();
  const { toast } = useToast();
  
  const generationLockRef = useRef(false);
  const initializationRef = useRef(false);

  // Poll for new songs in queue
  const pollForNewSongs = useCallback(async () => {
    if (!isStationActive) return;
    
    const { data: queueItems } = await supabase
      .from('queue')
      .select('*, songs(*)')
      .order('position');
    
    const songs = queueItems
      ?.filter(item => item.songs)
      .map(item => item.songs as Song) || [];
    
    setQueue(songs);
  }, [isStationActive]);

  // Auto-generate when queue is low
  useEffect(() => {
    if (!isStationActive || !stationSettings) return;
    
    const readySongs = queue.filter(s => s.status === 'ready' && s.url);
    if (readySongs.length <= 2 && !generationLockRef.current && !isGenerating) {
      console.log('🎵 Queue running low - generating new song...');
      generateNewSong();
    }
  }, [queue, isStationActive, stationSettings]);

  // Real-time subscription to queue changes
  useEffect(() => {
    if (!isStationActive) return;
    
    const queueChannel = supabase
      .channel('station-queue-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue' },
        () => pollForNewSongs()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'songs' },
        () => pollForNewSongs()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(queueChannel);
    };
  }, [isStationActive, pollForNewSongs]);

  // Handle song ending - auto-advance to next track
  useEffect(() => {
    if (!isStationActive) return;

    const handleSongEnded = () => {
      console.log('Song ended - auto-advancing...');
      skipToNext();
    };

    window.addEventListener('song-ended', handleSongEnded);
    return () => {
      window.removeEventListener('song-ended', handleSongEnded);
    };
  }, [isStationActive, queue, currentSong]);

  const generateNewSong = async () => {
    if (!stationSettings || generationLockRef.current || isGenerating) return;
    
    generationLockRef.current = true;
    try {
      await generateWithBuildPrompt(
        stationSettings.wildcard,
        stationSettings.instrumental,
        stationSettings.genres,
        stationSettings.mood,
        true,
        stationSettings.holiday
      );
    } catch (error) {
      console.error('Error generating song:', error);
    } finally {
      generationLockRef.current = false;
    }
  };

  const getRandomSong = async (excludeIds: string[]): Promise<Song | null> => {
    if (!stationSettings) return null;
    
    const genresLowerCase = stationSettings.genres.map(g => g.toLowerCase());
    
    let query = supabase
      .from('songs')
      .select('*')
      .eq('status', 'ready')
      .is('requested_by', null)
      .eq('is_public', true)
      .not('url', 'is', null);
    
    if (genresLowerCase.length > 0) {
      query = query.in('genre', genresLowerCase);
    }
    
    if (stationSettings.mood) {
      query = query.eq('mood', stationSettings.mood.toLowerCase());
    }
    
    if (excludeIds.length > 0) {
      query = query.not('id', 'in', `(${excludeIds.join(',')})`);
    }
    
    const { data: songs } = await query.limit(50);
    
    if (!songs || songs.length === 0) return null;
    
    return songs[Math.floor(Math.random() * songs.length)] as Song;
  };

  const addSongToQueue = async (song: Song) => {
    const { data: existingQueue } = await supabase
      .from('queue')
      .select('position')
      .order('position', { ascending: false })
      .limit(1);
    
    const maxPosition = existingQueue?.[0]?.position || 0;
    
    await supabase.from('queue').insert({
      song_id: song.id,
      position: maxPosition + 1,
      status: 'queued'
    });
  };

  const startStation = async (settings: StationSettings) => {
    if (initializationRef.current) return;
    initializationRef.current = true;
    
    setStationSettings(settings);
    setIsStationActive(true);
    setQueue([]);
    
    try {
      // Check for existing ready songs in queue
      const { data: existingReadyQueue } = await supabase
        .from('queue')
        .select('*, songs(*)')
        .eq('songs.status', 'ready')
        .not('songs.url', 'is', null)
        .order('position');
      
      const existingReadySongs = existingReadyQueue
        ?.filter(item => item.songs)
        .map(item => item.songs as Song) || [];
      
      if (existingReadySongs.length > 0) {
        const firstSong = existingReadySongs[0];
        playSong(firstSong, 'player');
        
        // Remove from queue
        const queueItemToRemove = existingReadyQueue?.find(item => item.songs?.id === firstSong.id);
        if (queueItemToRemove) {
          await supabase.from('queue').delete().eq('id', queueItemToRemove.id);
        }
        
        toast({ title: "Music Ready!", description: `Playing ${firstSong.title}` });
        
        if (existingReadySongs.length <= 2) {
          setTimeout(() => generateNewSong(), 1000);
        }
      } else {
        // Get random song to play immediately
        const currentSong = await getRandomSong([]);
        if (currentSong) {
          playSong(currentSong, 'player');
          toast({ title: "Music Ready!", description: `Playing ${currentSong.title}` });
          
          // Queue another song
          const nextSong = await getRandomSong([currentSong.id]);
          if (nextSong) {
            await addSongToQueue(nextSong);
          }
          
          // Generate new song
          setTimeout(() => generateNewSong(), 1000);
        }
      }
      
      pollForNewSongs();
    } catch (error) {
      console.error('Error starting station:', error);
      toast({
        title: "Error",
        description: "Failed to start station.",
        variant: "destructive"
      });
    } finally {
      setTimeout(() => {
        initializationRef.current = false;
      }, 2000);
    }
  };

  const stopStation = () => {
    setIsStationActive(false);
    setQueue([]);
    setStationSettings(null);
    stopAudio();
  };

  const skipToNext = async () => {
    const readySongs = queue.filter(s => s.status === 'ready' && s.url);
    
    if (readySongs.length > 0) {
      const nextSong = readySongs[0];
      playSong(nextSong, 'player');
      
      // Remove from queue
      const { data: queueItems } = await supabase
        .from('queue')
        .select('id, song_id')
        .eq('song_id', nextSong.id)
        .single();
      
      if (queueItems) {
        await supabase.from('queue').delete().eq('id', queueItems.id);
      }
      
      toast({ title: 'Next Track', description: nextSong.title });
    } else {
      // Get from library
      const nextSong = await getRandomSong(currentSong ? [currentSong.id] : []);
      if (nextSong) {
        playSong(nextSong, 'player');
        toast({ title: 'Next Track', description: nextSong.title });
        setTimeout(() => generateNewSong(), 500);
      }
    }
  };

  const refreshQueue = async () => {
    await pollForNewSongs();
  };

  return (
    <StationContext.Provider
      value={{
        isStationActive,
        queue,
        stationSettings,
        startStation,
        stopStation,
        skipToNext,
        refreshQueue,
      }}
    >
      {children}
    </StationContext.Provider>
  );
}

export function useStation() {
  const context = useContext(StationContext);
  if (context === undefined) {
    throw new Error('useStation must be used within a StationProvider');
  }
  return context;
}
