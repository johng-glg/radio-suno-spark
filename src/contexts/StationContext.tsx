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
  const pollForNewSongs = useCallback(async (force = false) => {
    if (!isStationActive && !force) return;
    if (!stationSettings) return;
    
    const { data: queueItems } = await supabase
      .from('queue')
      .select('*, songs(*)')
      .order('position');
    
    const allSongs = queueItems
      ?.filter(item => item.songs)
      .map(item => item.songs as Song) || [];
    
    // Filter songs to match current station settings
    const matchingSongs = allSongs.filter(song => {
      const genresLowerCase = stationSettings.genres.map(g => g.toLowerCase());
      const genreMatch = genresLowerCase.length === 0 || 
        genresLowerCase.includes(song.genre?.toLowerCase());
      const moodMatch = !stationSettings.mood || 
        song.mood?.toLowerCase() === stationSettings.mood.toLowerCase();
      return genreMatch && moodMatch;
    });
    
    console.log(`📋 Queue updated: ${matchingSongs.length}/${allSongs.length} songs match (${matchingSongs.filter(s => s.status === 'ready').length} ready)`);
    setQueue([...matchingSongs]); // Force new array reference to trigger re-render
  }, [isStationActive, stationSettings]);

  // Initial fetch when station becomes active
  useEffect(() => {
    if (isStationActive) {
      pollForNewSongs(true);
    }
  }, [isStationActive, pollForNewSongs]);

  // Periodic polling while station is active
  useEffect(() => {
    if (!isStationActive) return;
    const intervalId = setInterval(() => pollForNewSongs(true), 5000);
    return () => clearInterval(intervalId);
  }, [isStationActive, pollForNewSongs]);

  // Auto-generate when queue is low (maintain up to 2 songs in queue)
  useEffect(() => {
    if (!isStationActive || !stationSettings) return;
    
    const readySongs = queue.filter(s => s.status === 'ready' && s.url);
    const generatingSongs = queue.filter(s => s.status === 'generating');
    const totalInQueue = readySongs.length + generatingSongs.length;
    
    // Generate if we have less than 2 songs in queue and not already generating
    if (totalInQueue < 2 && !generationLockRef.current && !isGenerating) {
      console.log(`🎵 Queue has ${totalInQueue} songs - generating new song...`);
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
        () => pollForNewSongs(true)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'songs' },
        () => pollForNewSongs(true)
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
      console.log('🎵 Generating song with mood:', stationSettings.mood);
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
    
    // IMPORTANT: Only use genre and mood for playback matching
    // Holiday and other advanced options are ONLY for generation, not playback
    const genresLowerCase = stationSettings.genres.map(g => g.toLowerCase());
    const moodLowerCase = stationSettings.mood?.toLowerCase();
    
    console.log('🔍 Searching for songs with (PLAYBACK - no holiday filter):', {
      genres: genresLowerCase,
      mood: moodLowerCase,
      excludeIds: excludeIds.length,
      note: 'Holiday filter is NOT applied for playback'
    });
    
    let query = supabase
      .from('songs')
      .select('*')
      .eq('status', 'ready')
      .eq('is_public', true)
      .not('url', 'is', null);
    
    if (excludeIds.length > 0) {
      const quoted = excludeIds.map((id) => `'${id}'`).join(',');
      query = query.not('id', 'in', `(${quoted})`);
    }
    
    const { data: allSongs, error } = await query.limit(500);
    
    if (error) {
      console.error('Error fetching songs:', error);
      return null;
    }
    
    if (!allSongs || allSongs.length === 0) {
      console.error('❌ No public ready songs found in database');
      return null;
    }
    
    // Filter by genre and mood ONLY (case-insensitive) on client side
    // NEVER filter by holiday - that's only for generation
    let filteredSongs = allSongs.filter(song => {
      const genreMatch = genresLowerCase.length === 0 || 
        genresLowerCase.includes(song.genre?.toLowerCase());
      const moodMatch = !moodLowerCase || 
        song.mood?.toLowerCase() === moodLowerCase;
      // Explicitly NOT filtering by holiday - we want ALL songs matching genre+mood
      return genreMatch && moodMatch;
    });
    
    console.log(`📚 Found ${filteredSongs.length} matching songs (out of ${allSongs.length} total)`);
    
    // If no exact match and mood was specified, try without mood filter
    if (filteredSongs.length === 0 && moodLowerCase) {
      console.log('⚠️ No exact match found, trying genre-only...');
      filteredSongs = allSongs.filter(song => {
        return genresLowerCase.length === 0 || 
          genresLowerCase.includes(song.genre?.toLowerCase());
      });
      console.log(`📚 Found ${filteredSongs.length} songs with genre match only`);
    }
    
    // If still no match, return any random song
    if (filteredSongs.length === 0) {
      console.log('⚠️ No genre match, returning random song from library');
      filteredSongs = allSongs;
    }
    
    if (filteredSongs.length === 0) return null;
    
    return filteredSongs[Math.floor(Math.random() * filteredSongs.length)] as Song;
  };

  const addSongToQueue = async (song: Song) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data: existingQueue } = await supabase
      .from('queue')
      .select('position')
      .order('position', { ascending: false })
      .limit(1);
    
    const maxPosition = existingQueue?.[0]?.position || 0;
    
    await supabase.from('queue').insert({
      song_id: song.id,
      user_id: user.id,
      position: maxPosition + 1,
      status: 'queued'
    });
  };

  const startStation = async (settings: StationSettings) => {
    if (initializationRef.current) return;
    initializationRef.current = true;
    
    console.log('🎵 Starting station with settings:', settings);
    console.log('🎵 Mood received:', settings.mood);
    
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
      
      console.log(`Found ${existingReadySongs.length} existing ready songs in queue`);
      
      // Check if existing songs match our genre/mood (NOT holiday - that's only for generation)
      const matchingSong = existingReadySongs.find(song => {
        const genreMatch = settings.genres.length === 0 || 
          settings.genres.some(g => g.toLowerCase() === song.genre?.toLowerCase());
        const moodMatch = !settings.mood || song.mood?.toLowerCase() === settings.mood.toLowerCase();
        // Explicitly NOT checking holiday - we want any song matching genre+mood
        return genreMatch && moodMatch;
      });
      
      if (matchingSong) {
        console.log(`Playing matching song from queue: ${matchingSong.title} (${matchingSong.genre} - ${matchingSong.mood})`);
        
        playSong(matchingSong, 'player');
        
        // Remove from queue
        const queueItemToRemove = existingReadyQueue?.find(item => item.songs?.id === matchingSong.id);
        if (queueItemToRemove) {
          await supabase.from('queue').delete().eq('id', queueItemToRemove.id);
          await pollForNewSongs(true);
        }
        
        toast({ title: "Music Ready!", description: `Playing ${matchingSong.title}` });
        
        // Start generating two songs for the queue
        setTimeout(() => {
          generateNewSong();
          setTimeout(() => generateNewSong(), 1500);
        }, 1000);
      } else {
        console.log('No matching songs in queue - getting from library (genre+mood only, NO holiday):', {
          genres: settings.genres,
          mood: settings.mood,
          holiday: settings.holiday + ' (NOT used for matching)'
        });
        
        // Get random song from library with proper filtering
        const currentSong = await getRandomSong([]);
        if (currentSong) {
          console.log(`✅ Playing from library: ${currentSong.title} (${currentSong.genre} - ${currentSong.mood})`);
          playSong(currentSong, 'player');
          toast({ title: "Music Ready!", description: `Playing ${currentSong.title}` });
          
          // Start generating two songs for the queue
          setTimeout(() => {
            generateNewSong();
            setTimeout(() => generateNewSong(), 1500);
          }, 1000);
        } else {
          console.error('❌ No songs found matching criteria');
          toast({
            title: "No Songs Found",
            description: "No songs match your selection. Try different settings.",
            variant: "destructive"
          });
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
        await pollForNewSongs(true);
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
    await pollForNewSongs(true);
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
