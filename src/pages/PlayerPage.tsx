import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Play, Pause, SkipForward, ThumbsUp, ThumbsDown, 
  Settings, Music, Clock, Volume2, ArrowLeft, LogOut, User, Sparkles, Info, RefreshCw
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useMusicGeneration } from "@/hooks/useMusicGeneration";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { supabase } from "@/integrations/supabase/client";
import SettingsPopup from "@/components/SettingsPopup";

interface Song {
  id: string;
  title: string;
  description?: string;
  genre: string;
  mood?: string;
  url?: string;
  image_url?: string;
  status: 'generating' | 'ready' | 'failed';
  prompt?: string;
  created_at?: string;
  updated_at?: string;
  requested_by?: string | null;
  // New fields for Build Prompt metadata
  prompt_metadata?: {
    template_used?: string;
    selected_words?: Record<string, string>;
    wild_card_applied?: boolean;
  };
  // User interaction
  user_interaction?: 'like' | 'dislike' | null;
}

interface PlayerPageProps {
  selectedGenres: string[];
  selectedMood?: string;
  instrumentalMode?: boolean;
  wildcardMode?: boolean;
  onBack: () => void;
  onSettingsUpdate?: (settings: {
    genres: string[];
    mood?: string;
    instrumentalMode: boolean;
    wildcardMode: boolean;
  }) => void;
}

export default function PlayerPage({ selectedGenres, selectedMood, instrumentalMode = false, wildcardMode = false, onBack, onSettingsUpdate }: PlayerPageProps) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [librarySongsUsedInSession, setLibrarySongsUsedInSession] = useState(0);
  const [sessionMode, setSessionMode] = useState<'prefill' | 'generate_only'>('prefill');
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState([80]);
  const [currentInteraction, setCurrentInteraction] = useState<'like' | 'dislike' | null>(null);
  const [showPromptInfo, setShowPromptInfo] = useState(false);
  const [lastDislikedElements, setLastDislikedElements] = useState<{mood?: string, instrument?: string}>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const generationLockRef = useRef(false); // prevent concurrent generations
  const initializationRef = useRef(false); // prevent multiple initializations
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const { generateWithBuildPrompt, isGenerating } = useMusicGeneration();
  const { preferences, toggleWildCardMode, addExclusion } = useUserPreferences();
  

  // Audio element setup
  useEffect(() => {
    if (audioRef.current) {
      const audio = audioRef.current;
      
      const handleLoadedMetadata = () => {
        setDuration(audio.duration);
      };
      
      const handleTimeUpdate = () => {
        setProgress((audio.currentTime / audio.duration) * 100);
      };
      
      const handleEnded = async () => {
        // Check if queue is empty when song ends
        if (queue.length <= 1) { // Current song + nothing else
          console.log('Song ended and queue is empty, fetching fallback...');
          await handleEmptyQueueFallback();
        }
        handleSkip();
      };
      
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('ended', handleEnded);
      
      return () => {
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('ended', handleEnded);
      };
    }
  }, [currentSong]);

  // Volume control
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume[0] / 100;
    }
  }, [volume]);

  // Load interaction status when song changes
  useEffect(() => {
    if (currentSong && user) {
      const loadInteraction = async () => {
        const { data } = await supabase
          .from('user_song_interactions')
          .select('interaction_type')
          .eq('user_id', user.id)
          .eq('song_id', currentSong.id)
          .maybeSingle();
        
        setCurrentInteraction(data?.interaction_type as 'like' | 'dislike' | null || null);
      };
      loadInteraction();
    }
  }, [currentSong, user]);

  // Auto-play when a new song loads
  useEffect(() => {
    if (currentSong?.url && audioRef.current) {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((error) => {
        console.log('Auto-play prevented by browser:', error);
        // Don't show error toast for auto-play prevention, it's expected behavior
      });
    }
  }, [currentSong?.url]);

  // Initialize with first song and load queue from database
  useEffect(() => {
    // Prevent duplicate initializations
    if (initializationRef.current) {
      console.log('Initialization already in progress, skipping...');
      return;
    }
    
    initializationRef.current = true;
    
    // Clear existing songs when genre selection changes
    console.log('Genre/mood changed, clearing queue and loading new songs');
    setCurrentSong(null);
    setQueue([]);
    setLibrarySongsUsedInSession(0);
    setSessionMode('prefill');
    
    // Clear the database queue as well
    const clearDatabaseQueue = async () => {
      try {
        await supabase.from('queue').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
        console.log('Database queue cleared');
      } catch (error) {
        console.error('Error clearing database queue:', error);
      }
    };
    
    const initializePlayer = async () => {
      try {
        await clearDatabaseQueue();
        
        // Force refresh of current song data to get updated descriptions
        if (currentSong) {
          try {
            const { data: updatedSong } = await supabase
              .from('songs')
              .select('*')
              .eq('id', currentSong.id)
              .single();
            
            if (updatedSong) {
              setCurrentSong(updatedSong as Song);
            }
          } catch (error) {
            console.error('Error refreshing song data:', error);
          }
        }
        
        await generateInitialSongs(); // This now handles both loading existing and generating new songs
      } finally {
        // Reset initialization flag after a delay to allow for legitimate re-initializations
        setTimeout(() => {
          initializationRef.current = false;
        }, 2000);
      }
    };
    
    initializePlayer();
    
    // Set up real-time subscription to queue changes
    const queueChannel = supabase
      .channel('queue-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'queue'
        },
        () => {
          console.log('Queue changed, refreshing display...');
          pollForNewSongs();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public', 
          table: 'songs'
        },
        (payload) => {
          console.log('Song updated:', payload);
          pollForNewSongs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(queueChannel);
      initializationRef.current = false;
    };
  }, [selectedGenres, selectedMood]);

  const loadQueueFromDatabase = async () => {
    try {
      console.log('Loading optimized queue strategy - library songs for first 2 only...');
      
      // Only use library songs during prefill phase and for the first 2 songs in a session
      if (sessionMode === 'prefill' && librarySongsUsedInSession < 2) {
        // Strategy: Start with library song immediately for first 2 songs
        const currentLibrarySong = await getOptimalExistingSong();
        
        if (currentLibrarySong) {
          console.log(`Found library song for immediate playback (${librarySongsUsedInSession + 1}/2):`, currentLibrarySong.title);
          setCurrentSong(currentLibrarySong);
          setLibrarySongsUsedInSession(prev => prev + 1);
          
          // Show immediate feedback for instant playbook
          toast({
            title: "Music Ready!",
            description: `Playing ${currentLibrarySong.title} instantly while preparing more tracks...`,
          });
          
          // If this was the first library song, add one more library song to queue
          if (librarySongsUsedInSession === 0) {
            const nextLibrarySong = await getOptimalExistingSong(currentLibrarySong.id);
            if (nextLibrarySong) {
              console.log('Adding second library song to queue:', nextLibrarySong.title);
              await addSongToQueue(nextLibrarySong);
            }
          }
          
          // Always schedule generation after library songs
          setTimeout(() => {
            // Strict concurrency control - only allow one generation per session
            if (generationLockRef.current || isGenerating) {
              console.log('Skipping generation - already in progress (lock:', generationLockRef.current, 'generating:', isGenerating, ')');
              return;
            }
            
            console.log('Starting generation for next position in queue...');
            generationLockRef.current = true;
            setSessionMode('generate_only');
            
            generateWithBuildPrompt(wildcardMode, instrumentalMode, selectedGenres, selectedMood)
              .catch(err => console.error('Background generation failed:', err))
              .finally(() => {
                // Release lock after a delay to prevent rapid successive calls
                setTimeout(() => {
                  generationLockRef.current = false;
                  console.log('Generation lock released');
                }, 5000);
              });
          }, 3000);
          
          // Switch to generate-only mode after initial library prefill
          setSessionMode('generate_only');
          return true;
        }
      }
      
      // After 2 library songs or if no library songs available, only generate
      console.log('Library song limit reached or no library songs available, generating only...');
      return false;
      
    } catch (error) {
      console.error('Error loading optimized queue:', error);
      return false;
    }
  };

  const getOptimalExistingSong = async (excludeSongId?: string) => {
    try {
      // Build query to get songs with user interaction data  
      // Convert selected genres to lowercase for case-insensitive matching
      const genresLowerCase = selectedGenres.map(g => g.toLowerCase());
      
      let query = supabase
        .from('songs')
        .select(`
          *,
          user_song_interactions!left(interaction_type)
        `)
        .eq('status', 'ready')
        .is('requested_by', null) // Only get library songs (pre-made songs)
        .not('url', 'is', null);

      // Only filter by genre if genres are actually selected
      if (genresLowerCase.length > 0) {
        query = query.in('genre', genresLowerCase);
      }
      
      if (excludeSongId) {
        query = query.neq('id', excludeSongId);
      }
      
      // Use random ordering to get a diverse pool instead of always newest songs
      // Get a larger pool for better randomization
      const { data: songs, error } = await query.limit(50);
      
      if (error) {
        console.error('Error fetching existing songs:', error);
        return null;
      }
      
      if (!songs || songs.length === 0) return null;
      
      // Randomly shuffle the entire array first for better variety
      const shuffledSongs = [...songs].sort(() => Math.random() - 0.5);
      
      // Sort by preference: liked > unheard > disliked
      const songsWithScores = shuffledSongs.map(song => {
        const interaction = song.user_song_interactions?.[0];
        let score = 0;
        
        if (!interaction) score = 2; // Unheard songs get priority
        else if (interaction.interaction_type === 'like') score = 3; // Liked songs highest
        else if (interaction.interaction_type === 'dislike') score = 1; // Disliked songs lowest
        
        // Add random factor to score for more variety
        const randomBonus = Math.random() * 0.5; // 0-0.5 random bonus
        
        return { ...song, score: score + randomBonus, user_interaction: interaction?.interaction_type || null };
      });
      
      // Sort by score and pick from top candidates
      songsWithScores.sort((a, b) => b.score - a.score);
      const topCandidates = songsWithScores.slice(0, Math.min(10, songsWithScores.length)); // Top 10 candidates for better variety
      
      // Randomly pick from top candidates
      const selectedSong = topCandidates[Math.floor(Math.random() * topCandidates.length)];
      
      // Clean up the song object to match Song interface
      const cleanSong: Song = {
        id: selectedSong.id,
        title: selectedSong.title,
        description: selectedSong.description,
        genre: selectedSong.genre,
        mood: selectedSong.mood,
        url: selectedSong.url,
        image_url: (selectedSong as any).image_url,
        status: selectedSong.status as 'generating' | 'ready' | 'failed',
        prompt: selectedSong.prompt,
        created_at: selectedSong.created_at,
        updated_at: selectedSong.updated_at,
        requested_by: (selectedSong as any).requested_by,
        prompt_metadata: (selectedSong as any).prompt_metadata || undefined,
        user_interaction: selectedSong.user_interaction as 'like' | 'dislike' | null
      };
      
      return cleanSong;
      
    } catch (error) {
      console.error('Error getting optimal existing song:', error);
      return null;
    }
  };

  const addSongToQueue = async (song: Song) => {
    try {
      // Check if song already in queue
      const { data: existingQueue } = await supabase
        .from('queue')
        .select('id')
        .eq('song_id', song.id)
        .maybeSingle();
        
      if (existingQueue) return; // Already in queue
      
      // Get next position
      const { data: queueCount } = await supabase
        .from('queue')
        .select('position')
        .order('position', { ascending: false })
        .limit(1);
        
      const nextPosition = queueCount && queueCount.length > 0 ? queueCount[0].position + 1 : 1;
      
      // Add to queue
      await supabase.from('queue').insert({
        song_id: song.id,
        position: nextPosition,
        status: 'queued'
      });
      
      console.log('Added song to queue at position:', nextPosition);
    } catch (error) {
      console.error('Error adding song to queue:', error);
    }
  };

  const generateInitialSongs = async () => {
    // Always check for existing songs first
    const hasExistingSongs = await loadQueueFromDatabase();
    
    if (hasExistingSongs) {
      console.log('Using existing songs; generation will follow the alternating strategy.');
      return;
    }
    
    console.log('No existing songs found, generating initial songs');
    
    try {
      setSessionMode('generate_only');
      const result = await generateWithBuildPrompt(wildcardMode, instrumentalMode, selectedGenres, selectedMood);

      if (result?.success && result.song_id) {
        // Poll for the song to be completed and added to queue
        pollForNewSongs();
        
        toast({
          title: "Radio Started!",
          description: `Generating tracks with intelligent prompt system...`,
        });
      } else {
        // Handle API errors gracefully
        toast({
          title: "Service Temporarily Unavailable",
          description: "The music generation service is currently down. Please try again later.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error generating initial songs:', error);
      toast({
        title: "Connection Error", 
        description: "Unable to connect to music generation service. Please check your connection and try again.",
        variant: "destructive",
      });
    }
  };

  const pollForNewSongs = async () => {
    try {
      const { data: queueData, error } = await supabase
        .from('queue')
        .select(`
          id,
          songs (
            id,
            title,
            description,
            genre,
            mood,
            url,
            image_url,
            status,
            requested_by
          ),
          status
        `)
        .order('position', { ascending: true })
        .limit(5);

      if (error) {
        console.error('Error polling for songs:', error);
        return;
      }

      if (queueData && queueData.length > 0) {
        const songs = queueData.map(item => item.songs).filter(Boolean) as Song[];
        
        // If we don't have a current song yet, pick the first ready one and remove it from queue
        if (!currentSong) {
          const firstReady = songs.find(song => song.status === 'ready' && song.url);
          if (firstReady) {
            console.log('Setting first ready song as current:', firstReady);
            setCurrentSong(firstReady);
            
            // Remove the song from queue since it's now playing
            const queueItem = queueData.find(item => item.songs?.id === firstReady.id);
            if (queueItem) {
              await supabase.from('queue').delete().eq('id', queueItem.id);
            }
          }
        }
        
        // Show remaining songs in queue (since current song is removed from DB queue)
        const remainingSongs = songs.filter(song => song.id !== currentSong?.id);
        setQueue(remainingSongs);
      } else {
        // No songs in queue
        setQueue([]);
      }
    } catch (error) {
      console.error('Error polling for songs:', error);
    }
  };

  // Poll for song updates every 5 seconds
  useEffect(() => {
    const interval = setInterval(pollForNewSongs, 5000);
    return () => clearInterval(interval);
  }, [currentSong]);

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(() => {
          toast({
            title: "Playback Error",
            description: "Unable to play audio. This is a demo - actual audio files would be loaded from Suno API.",
            variant: "destructive"
          });
        });
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSkip = async () => {
    try {
      // Get the next song from database queue to ensure consistency
      const { data: queueData, error } = await supabase
        .from('queue')
        .select(`
          id,
          songs (
            id,
            title,
            description,
            genre,
            mood,
            url,
            image_url,
            status,
            requested_by
          )
        `)
        .order('position', { ascending: true })
        .limit(1);

      if (error) {
        console.error('Error getting next song from queue:', error);
        return;
      }

      if (queueData && queueData.length > 0 && queueData[0].songs) {
        const nextSong = queueData[0].songs as Song;
        const queueItemId = queueData[0].id;
        
        // Remove the queue item from database since we're about to play it
        await supabase.from('queue').delete().eq('id', queueItemId);
        
        // If current song is a library song (null requested_by) and we haven't reached the limit, increment counter
        if (nextSong.requested_by === null && librarySongsUsedInSession < 2) {
          setLibrarySongsUsedInSession(prev => prev + 1);
          console.log(`Library song played (${librarySongsUsedInSession + 1}/2):`, nextSong.title);
        }
        
        setCurrentSong(nextSong);
        setProgress(0);
        
        // After playing the next song, only generate new songs (no more library songs after first 2)
        setTimeout(() => {
          generateNextSong();
        }, 1000);
        
        toast({
          title: "Next Track",
          description: nextSong.title,
        });
      } else {
        console.log('No songs in queue, generating fallback...');
        await handleEmptyQueueFallback();
      }
    } catch (error) {
      console.error('Error in handleSkip:', error);
    }
  };

  const generateNextSong = async () => {
    // Strict concurrency control - only one generation at a time
    if (generationLockRef.current || isGenerating) {
      console.log('Generation already in progress, skipping...');
      return;
    }
    
    if (queue.length >= 3) {
      console.log('Queue is full, skipping generation');
      return;
    }
    
    generationLockRef.current = true;
    console.log('Generating new song for next track...');
    
    try {
      // Always generate new songs (no more alternating strategy)
      console.log('Generating new song...');
      setSessionMode('generate_only');
      await generateWithBuildPrompt(wildcardMode, instrumentalMode, selectedGenres, selectedMood);
    } catch (error) {
      console.error('Error in generateNextSong:', error);
    } finally {
      generationLockRef.current = false;
      console.log('Generation complete, lock released');
    }
  };

  const handleLike = async (isLike: boolean) => {
    if (!currentSong || !user) return;

    try {
      const interactionType = isLike ? 'like' : 'dislike';
      
      // Save to database
      const { error } = await supabase
        .from('user_song_interactions')
        .upsert({
          user_id: user.id,
          song_id: currentSong.id,
          interaction_type: interactionType
        }, {
          onConflict: 'user_id,song_id'
        });

      if (error) {
        console.error('Error saving interaction:', error);
        toast({
          title: "Error",
          description: "Failed to save your reaction. Please try again.",
          variant: "destructive"
        });
        return;
      }

      // Update local state
      setCurrentInteraction(interactionType);

      if (isLike) {
        toast({
          title: "Liked!",
          description: "We'll play more tracks like this",
        });
      } else {
        // Handle thumbs down - exclude last used mood and instrument
        if (currentSong?.prompt_metadata?.selected_words) {
          const { mood, instrument } = currentSong.prompt_metadata.selected_words;
          
          if (mood) {
            addExclusion('mood', mood);
            setLastDislikedElements(prev => ({ ...prev, mood }));
          }
          if (instrument) {
            addExclusion('instrument', instrument);
            setLastDislikedElements(prev => ({ ...prev, instrument }));
          }
          
          toast({
            title: "Disliked",
            description: `We'll avoid ${mood ? mood + ' mood' : ''}${mood && instrument ? ' and ' : ''}${instrument ? instrument + ' sounds' : ''} in future tracks`,
          });
        } else {
          toast({
            title: "Disliked",
            description: "We'll try different styles in the future",
          });
        }
      }
    } catch (error) {
      console.error('Error handling like/dislike:', error);
      toast({
        title: "Error",
        description: "Failed to save your reaction. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast({
        title: "Error",
        description: "Failed to sign out. Please try again.",
        variant: "destructive"
      });
    } else {
      onBack(); // Navigate back to landing page
      toast({
        title: "Signed out",
        description: "You have been successfully signed out.",
      });
    }
  };


  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRefreshGeneration = async () => {
    if (generationLockRef.current || isGenerating) {
      console.log('Refresh skipped: generation already in progress');
      return;
    }
    generationLockRef.current = true;
    setIsRefreshing(true);
    try {
      // Clean up any stale "generating" rows first
      await supabase.functions.invoke('check-stuck-songs');

      setSessionMode('generate_only');
      const result = await generateWithBuildPrompt(
        wildcardMode,
        instrumentalMode,
        selectedGenres,
        selectedMood
      );

      if (result?.success) {
        toast({ title: 'Generating…', description: 'Started a new track' });
        // Kick an immediate poll so the UI updates quickly
        await pollForNewSongs();
      } else if (result && result.error?.toLowerCase().includes('concurrency')) {
        toast({ title: 'Please wait', description: 'A track is already generating' });
      }
    } catch (error) {
      console.error('Error starting generation:', error);
      toast({ title: 'Error', description: 'Failed to start music generation', variant: 'destructive' });
    } finally {
      setIsRefreshing(false);
      // Release lock after a brief delay to avoid double-presses
      setTimeout(() => { generationLockRef.current = false; }, 3000);
    }
  };

  const handleEmptyQueueFallback = async () => {
    if (!currentSong) return;
    
    console.log('Queue is empty, handling fallback according to session mode...');
    
    try {
      if (sessionMode === 'prefill' && librarySongsUsedInSession < 2) {
        // Try to add one more library song if still in prefill phase
        const nextLibrarySong = await getOptimalExistingSong(currentSong.id);
        if (nextLibrarySong) {
          await addSongToQueue(nextLibrarySong);
          console.log(`Added library fallback song "${nextLibrarySong.title}" to queue`);
          return; // Do not generate immediately; queue will update
        }
      }

      // Otherwise, or if no library song found, generate a new one
      await generateNextSong();
    } catch (error) {
      console.error('Error in handleEmptyQueueFallback:', error);
    }
  };

  const handleSettingsSave = (newSettings: {
    genres: string[];
    mood?: string;
    instrumentalMode: boolean;
    wildcardMode: boolean;
  }) => {
    // Update user preferences for wildcardMode
    if (newSettings.wildcardMode !== preferences.wild_card_mode) {
      toggleWildCardMode();
    }
    
    // Call the parent component to update settings
    onSettingsUpdate?.(newSettings);
    
    toast({
      title: "Settings Updated",
      description: "New preferences will apply to next generated songs",
    });
  };

  const WaveformBars = () => (
    <div className="flex items-center justify-center space-x-1 h-16">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className={`bg-primary rounded-full w-1 ${isPlaying ? 'animate-waveform' : 'h-2'}`}
          style={{
            animationDelay: `${i * 0.1}s`,
            height: isPlaying ? 'auto' : '8px'
          }}
        />
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-4">
      <audio ref={audioRef} src={currentSong?.url} />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <Button variant="ghost" onClick={onBack} className="flex items-center space-x-2">
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Button>
        <div className="flex items-center space-x-2">
          <Music className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">AI Radio</h1>
        </div>
          <div className="flex items-center space-x-3">
            {user && (
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">{user.email}</span>
              </div>
            )}
            
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleSignOut}
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
      </div>

      <div className="max-w-2xl mx-auto space-y-8">
        {/* Now Playing */}
        <Card className="bg-card/50 backdrop-blur-sm">
          <CardContent className="p-8 text-center space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">{currentSong?.title || "Loading..."}</h2>
                {currentSong?.prompt_metadata && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPromptInfo(!showPromptInfo)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-muted-foreground">{currentSong?.description}</p>
              
              {/* Show prompt information when toggled */}
              {showPromptInfo && currentSong?.prompt_metadata && (
                <div className="bg-muted/20 rounded p-3 text-sm space-y-2">
                  <p><strong>Generated from:</strong> {currentSong.prompt_metadata.template_used}</p>
                  {currentSong.prompt_metadata.selected_words && (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(currentSong.prompt_metadata.selected_words).map(([key, value]) => (
                        <Badge key={key} variant="outline" className="text-xs">
                          {key}: {value}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {currentSong.prompt_metadata.wild_card_applied && (
                    <div className="flex items-center space-x-1">
                      <Sparkles className="h-3 w-3 text-yellow-400" />
                      <span className="text-yellow-400 text-xs">Wild Card Applied!</span>
                    </div>
                  )}
                </div>
              )}
              
              <div className="flex items-center justify-center space-x-2">
                {selectedGenres.map(genre => (
                  <Badge key={genre} variant="secondary">{genre}</Badge>
                ))}
                {selectedMood && (
                  <Badge variant="outline">{selectedMood}</Badge>
                )}
                {instrumentalMode && (
                  <Badge variant="outline" className="text-blue-400 border-blue-400/50">
                    <Volume2 className="h-3 w-3 mr-1" />
                    Instrumental
                  </Badge>
                )}
                {preferences.wild_card_mode && (
                  <Badge variant="outline" className="text-yellow-400 border-yellow-400/50">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Wild Card
                  </Badge>
                )}
              </div>
            </div>

            {/* Album Art / Waveform */}
            <div className="w-48 h-48 mx-auto bg-radio-surface rounded-lg flex items-center justify-center neon-glow overflow-hidden">
              {currentSong?.image_url ? (
                <img 
                  src={currentSong.image_url} 
                  alt={`${currentSong.title} album art`}
                  className="w-full h-full object-cover rounded-lg"
                />
              ) : (
                <WaveformBars />
              )}
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{formatTime((progress / 100) * duration)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center space-x-6">
              <Button
                variant="ghost"
                size="icon"
                className="player-control"
                onClick={() => setShowSettingsPopup(true)}
                title="Music Settings"
              >
                <Settings className="h-5 w-5" />
              </Button>
              
              <Button
                size="icon"
                className="h-16 w-16 rounded-full neon-glow"
                onClick={handlePlayPause}
              >
                {isPlaying ? (
                  <Pause className="h-8 w-8" />
                ) : (
                  <Play className="h-8 w-8" />
                )}
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                className="player-control"
                onClick={handleSkip}
                disabled={queue.length === 0 || !queue.some(song => song.status === 'ready')}
              >
                <SkipForward className="h-5 w-5" />
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                className={`player-control transition-colors ${currentInteraction === 'like' ? 'text-green-400 hover:text-green-300' : 'hover:text-green-400'}`}
                onClick={() => handleLike(true)}
              >
                <ThumbsUp className="h-5 w-5" />
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                className={`player-control transition-colors ${currentInteraction === 'dislike' ? 'text-red-400 hover:text-red-300' : 'hover:text-red-400'}`}
                onClick={() => handleLike(false)}
              >
                <ThumbsDown className="h-5 w-5" />
              </Button>
            </div>

            {/* Volume */}
            <div className="flex items-center space-x-3">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <Slider
                value={volume}
                onValueChange={setVolume}
                max={100}
                step={1}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground w-8">{volume[0]}</span>
            </div>
          </CardContent>
        </Card>

        {/* Queue Preview */}
        <Card className="bg-card/30 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Clock className="h-5 w-5" />
                <span className="text-lg font-semibold">Coming Up</span>
                {isGenerating && (
                  <Badge variant="secondary" className="ml-2">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse mr-1" />
                    Generating...
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefreshGeneration}
                disabled={isRefreshing || isGenerating}
                className="text-muted-foreground hover:text-foreground"
                title="Generate new music tracks"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <div className="space-y-3">
              {queue.filter(song => song.id !== currentSong?.id).slice(0, 3).map((song, index) => (
                <div key={song.id} className="flex items-center space-x-3 p-3 rounded-lg bg-muted/20">
                  <div className="w-10 h-10 rounded-md overflow-hidden bg-muted/40 flex-shrink-0">
                    {song.image_url ? (
                      <img 
                        src={song.image_url} 
                        alt={`${song.title} album art`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className={`w-full h-full flex items-center justify-center ${song.image_url ? 'hidden' : ''}`}>
                      <Music className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{song.title}</p>
                    <p className="text-sm text-muted-foreground">{song.description}</p>
                    {song.prompt_metadata?.wild_card_applied && (
                      <div className="flex items-center space-x-1 mt-1">
                        <Sparkles className="h-3 w-3 text-yellow-400" />
                        <span className="text-xs text-yellow-400">Wild Card</span>
                      </div>
                    )}
                  </div>
                  <Badge variant={song.status === 'ready' ? 'default' : 'secondary'}>
                    {song.status === 'ready' ? 'Ready' : 'Generating...'}
                  </Badge>
                </div>
              ))}
              {queue.filter(song => song.id !== currentSong?.id).length === 0 && !isGenerating && (
                <p className="text-center text-muted-foreground">Queue is empty. Generating new tracks...</p>
              )}
            </div>
            
            {/* Excluded preferences indicator */}
            {(preferences.excluded_moods.length > 0 || preferences.excluded_instruments.length > 0) && (
              <div className="mt-4 p-3 bg-muted/10 rounded border">
                <p className="text-xs text-muted-foreground mb-2">Currently avoiding:</p>
                <div className="flex flex-wrap gap-1">
                  {preferences.excluded_moods.map(mood => (
                    <Badge key={mood} variant="destructive" className="text-xs">
                      {mood} mood
                    </Badge>
                  ))}
                  {preferences.excluded_instruments.map(instrument => (
                    <Badge key={instrument} variant="destructive" className="text-xs">
                      {instrument}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Settings Popup */}
      <SettingsPopup
        isOpen={showSettingsPopup}
        onClose={() => setShowSettingsPopup(false)}
        currentGenres={selectedGenres}
        currentMood={selectedMood}
        instrumentalMode={instrumentalMode}
        wildcardMode={wildcardMode}
        onSaveSettings={handleSettingsSave}
      />
    </div>
  );
}