import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Play, Pause, SkipForward, ThumbsUp, ThumbsDown, 
  Settings, Music, Clock, Volume2, ArrowLeft, LogOut, User, Sparkles, Info, Download, RefreshCw
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useMusicGeneration } from "@/hooks/useMusicGeneration";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { supabase } from "@/integrations/supabase/client";

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
}

export default function PlayerPage({ selectedGenres, selectedMood, instrumentalMode = false, wildcardMode = false, onBack }: PlayerPageProps) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState([80]);
  const [currentInteraction, setCurrentInteraction] = useState<'like' | 'dislike' | null>(null);
  const [showPromptInfo, setShowPromptInfo] = useState(false);
  const [lastDislikedElements, setLastDislikedElements] = useState<{mood?: string, instrument?: string}>({});
  const [queueStrategy, setQueueStrategy] = useState<'existing' | 'generated'>('existing'); // Alternating strategy
  const [isFetchingImages, setIsFetchingImages] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
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
    // Clear existing songs when genre selection changes
    console.log('Genre/mood changed, clearing queue and loading new songs');
    setCurrentSong(null);
    setQueue([]);
    
    // Clear the database queue as well
    const clearDatabaseQueue = async () => {
      try {
        await supabase.from('queue').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
        console.log('Database queue cleared');
      } catch (error) {
        console.error('Error clearing database queue:', error);
      }
    };
    
    clearDatabaseQueue();
    
    // Force refresh of current song data to get updated descriptions
    if (currentSong) {
      const refreshSongData = async () => {
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
      };
      refreshSongData();
    }
    
    generateInitialSongs(); // This now handles both loading existing and generating new songs
    
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
          console.log('Queue changed, reloading...');
          loadQueueFromDatabase();
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
          loadQueueFromDatabase();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(queueChannel);
    };
  }, [selectedGenres, selectedMood]);

  const loadQueueFromDatabase = async () => {
    try {
      console.log('Loading optimized queue strategy...');
      
      // Strategy: Start with existing song, then alternate between generated and existing
      // First, get an existing song from database that matches our genres and user preferences
      const existingSong = await getOptimalExistingSong();
      
      if (existingSong) {
        console.log('Found optimal existing song:', existingSong.title);
        setCurrentSong(existingSong);
        
        // Show immediate feedback for instant playback
        toast({
          title: "Music Ready!",
          description: `Playing ${existingSong.title} instantly while preparing more tracks...`,
        });
        
        // Schedule a SINGLE generation after a delay (no concurrent generations)
        setTimeout(() => {
          // Force generation of new songs when switching genres, don't just rely on alternating strategy
          console.log('Forcing generation of new songs for genre change...');
          // Add delay to prevent concurrent requests
          if (!generationLockRef.current && !isGenerating) {
            generateWithBuildPrompt(wildcardMode, instrumentalMode, selectedGenres, selectedMood)
              .catch(err => console.error('Background generation failed:', err));
          } else {
            console.log('Skipping generation - already in progress');
          }
        }, 3000); // Increased delay to 3 seconds
        
        return true;
      }
      
      console.log('No existing songs found, falling back to generation');
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
        .in('genre', genresLowerCase)
        .not('url', 'is', null);
      
      if (excludeSongId) {
        query = query.neq('id', excludeSongId);
      }
      
      // Prioritize songs user hasn't heard or liked
      const { data: songs, error } = await query
        .order('created_at', { ascending: false })
        .limit(20); // Get a pool to choose from
      
      if (error) {
        console.error('Error fetching existing songs:', error);
        return null;
      }
      
      if (!songs || songs.length === 0) return null;
      
      // Sort by preference: liked > unheard > disliked
      const songsWithScores = songs.map(song => {
        const interaction = song.user_song_interactions?.[0];
        let score = 0;
        
        if (!interaction) score = 2; // Unheard songs get priority
        else if (interaction.interaction_type === 'like') score = 3; // Liked songs highest
        else if (interaction.interaction_type === 'dislike') score = 1; // Disliked songs lowest
        
        return { ...song, score, user_interaction: interaction?.interaction_type || null };
      });
      
      // Sort by score and pick from top candidates
      songsWithScores.sort((a, b) => b.score - a.score);
      const topSongs = songsWithScores.slice(0, 5); // Top 5 candidates
      
      // Randomly pick from top candidates for variety
      const selectedSong = topSongs[Math.floor(Math.random() * topSongs.length)];
      
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
          songs (
            id,
            title,
            description,
            genre,
            mood,
            url,
            image_url,
            status
          )
        `)
        .order('position', { ascending: true })
        .limit(5);

      if (error) {
        console.error('Error polling for songs:', error);
        return;
      }

      if (queueData && queueData.length > 0) {
        const songs = queueData.map(item => item.songs).filter(Boolean) as Song[];
        const readySongs = songs.filter(song => song.status === 'ready' && song.url);
        
        if (readySongs.length > 0 && !currentSong) {
          console.log('Setting first ready song as current:', readySongs[0]);
          setCurrentSong(readySongs[0]);
          setQueue(readySongs.slice(1));
        } else if (readySongs.length > 0) {
          console.log('Adding ready songs to queue:', readySongs.length);
          setQueue(readySongs.slice(currentSong ? 1 : 0));
        }
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

  const handleSkip = () => {
    if (queue.length > 0) {
      const nextSong = queue[0];
      setCurrentSong(nextSong);
      setQueue(prev => prev.slice(1));
      setProgress(0);
      
      // Generate next song in background
      generateNextSong();
      
      toast({
        title: "Next Track",
        description: nextSong.title,
      });
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
    console.log('Starting generation with strategy:', queueStrategy);
    
    try {
      if (queueStrategy === 'generated') {
        // Generate a new song
        console.log('Generating new song...');
        await generateWithBuildPrompt(wildcardMode, instrumentalMode, selectedGenres, selectedMood);
        setQueueStrategy('existing'); // Switch to existing for next
      } else {
        // Add an existing song
        console.log('Looking for existing song...');
        const existingSong = await getOptimalExistingSong();
        if (existingSong) {
          await addSongToQueue(existingSong);
          setQueue(prev => [...prev, existingSong]);
          setQueueStrategy('generated'); // Switch to generated for next
        } else {
          // Fallback to generation if no existing songs
          console.log('No existing songs, generating new one...');
          await generateWithBuildPrompt(wildcardMode, instrumentalMode, selectedGenres, selectedMood);
        }
      }
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

  const handleFetchMissingImages = async () => {
    setIsFetchingImages(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-missing-images');
      
      if (error) {
        toast({
          title: "Error",
          description: "Failed to fetch missing images",
          variant: "destructive"
        });
        console.error('Error fetching images:', error);
      } else {
        toast({
          title: "Success",
          description: data.message,
        });
        console.log('Fetch images result:', data);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsFetchingImages(false);
    }
  };

  const handleRefreshGeneration = async () => {
    setIsRefreshing(true);
    try {
      // First clean up any stuck songs
      await supabase.functions.invoke('check-stuck-songs');
      
      await generateInitialSongs();
      toast({
        title: "Success",
        description: "Started generating new music tracks",
      });
    } catch (error) {
      console.error('Error starting generation:', error);
      toast({
        title: "Error", 
        description: "Failed to start music generation",
        variant: "destructive"
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleEmptyQueueFallback = async () => {
    if (!currentSong) return;
    
    console.log('Queue is empty, fetching random fallback song and generating more...');
    
    try {
      // Fetch a random existing song of the same genre as fallback
      const { data: fallbackSongs, error: fallbackError } = await supabase
        .from('songs')
        .select('*')
        .eq('status', 'ready')
        .eq('genre', currentSong.genre)
        .not('url', 'is', null)
        .neq('id', currentSong.id) // Don't repeat current song
        .limit(10);

      if (fallbackError) {
        console.error('Error fetching fallback songs:', fallbackError);
      } else if (fallbackSongs && fallbackSongs.length > 0) {
        // Pick a random song from the results
        const randomSong = fallbackSongs[Math.floor(Math.random() * fallbackSongs.length)];
        
        // Add to queue
        const { data: queueData, error: queueError } = await supabase
          .from('queue')
          .select('position')
          .order('position', { ascending: false })
          .limit(1);

        if (!queueError) {
          const nextPosition = (queueData?.[0]?.position || 0) + 1;
          
          await supabase.from('queue').insert({
            song_id: randomSong.id,
            position: nextPosition,
            status: 'queued'
          });
          
          console.log(`Added fallback song "${randomSong.title}" to queue`);
        }
      }

      // Also trigger generation for more songs
      generateInitialSongs().catch(err => 
        console.error('Background generation failed:', err)
      );
      
    } catch (error) {
      console.error('Fallback handling failed:', error);
    }
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
            
            {/* Wild Card Mode Toggle */}
            <div className="flex items-center space-x-2">
              <Label htmlFor="wild-card" className="text-sm hidden sm:inline">Wild Card</Label>
              <Switch
                id="wild-card"
                checked={preferences.wild_card_mode}
                onCheckedChange={toggleWildCardMode}
              />
              <Sparkles className={`h-4 w-4 ${preferences.wild_card_mode ? 'text-yellow-400' : 'text-muted-foreground'}`} />
            </div>
            
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleFetchMissingImages}
              disabled={isFetchingImages}
              className="text-muted-foreground hover:text-foreground hidden sm:flex items-center space-x-1"
              title="Fetch missing album artwork for past generations"
            >
              <Download className="h-4 w-4" />
              <span className="hidden md:inline">{isFetchingImages ? 'Fetching...' : 'Fetch Album Art'}</span>
            </Button>
            
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleSignOut}
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <Settings className="h-4 w-4" />
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
    </div>
  );
}