import { useState, useEffect, useRef, useCallback } from "react";
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
  prompt_metadata?: {
    template_used?: string;
    selected_words?: Record<string, string>;
    wild_card_applied?: boolean;
  };
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState([80]);
  const [currentInteraction, setCurrentInteraction] = useState<'like' | 'dislike' | null>(null);
  const [showPromptInfo, setShowPromptInfo] = useState(false);
  const [lastDislikedElements, setLastDislikedElements] = useState<{mood?: string, instrument?: string}>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const generationLockRef = useRef(false);
  const initializationRef = useRef(false);
  const generateNewSongRef = useRef<(() => Promise<void>) | null>(null);
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const { generateWithBuildPrompt, isGenerating } = useMusicGeneration();
  const { preferences, toggleWildCardMode, addExclusion, updatePreferences } = useUserPreferences();

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
      
      const handleSongEnded = async () => {
        console.log('Song ended - auto-advancing to next track');
        try {
          setIsSkipping(true);
          
          // Check if there's a ready song in queue
          const { data: readyQueueItems } = await supabase
            .from('queue')
            .select('*, songs(*)')
            .eq('songs.status', 'ready')
            .not('songs.url', 'is', null)
            .order('position');
          
          const readySongs = readyQueueItems?.filter(item => item.songs).map(item => item.songs as Song) || [];
          
          if (readySongs.length > 0) {
            const nextSong = readySongs[0];
            console.log(`✅ Auto-advancing to: "${nextSong.title}"`);
            
            // Remove from queue
            const queueItemToRemove = readyQueueItems?.find(item => item.songs?.id === nextSong.id);
            if (queueItemToRemove) {
              await supabase.from('queue').delete().eq('id', queueItemToRemove.id);
            }
            
            setCurrentSong(nextSong);
            setProgress(0);
            
            toast({
              title: 'Next Track',
              description: nextSong.title,
            });
          } else {
            // No ready songs in queue - get one from library
            console.log('⚠️ No ready songs in queue - getting from library');
            
            // Need to get current values for query
            const genresLowerCase = selectedGenres.map(g => g.toLowerCase());
            
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
            
            if (selectedMood) {
              query = query.eq('mood', selectedMood.toLowerCase());
            }
            
            if (currentSong?.id) {
              query = query.neq('id', currentSong.id);
            }
            
            const { data: songs } = await query.limit(50);
            
            if (songs && songs.length > 0) {
              const nextSong = songs[Math.floor(Math.random() * songs.length)];
              console.log(`✅ Auto-playing from library: "${nextSong.title}"`);
              setCurrentSong(nextSong as Song);
              setProgress(0);
              
              toast({
                title: 'Next Track',
                description: nextSong.title,
              });
              
              // Generate a new song after auto-advance
              console.log('🎵 Triggering generation after auto-advance...');
              setTimeout(() => {
                if (generateNewSongRef.current) {
                  generateNewSongRef.current();
                }
              }, 500);
            } else {
              toast({
                title: "No Next Song",
                description: "No songs available.",
                variant: "destructive"
              });
            }
          }
          
        } catch (error) {
          console.error('Auto-advance failed:', error);
        } finally {
          setTimeout(() => {
            setIsSkipping(false);
          }, 300);
        }
      };
      
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('ended', handleSongEnded);
      
      return () => {
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('ended', handleSongEnded);
      };
    }
  }, [currentSong, selectedGenres, selectedMood, wildcardMode, instrumentalMode, isGenerating, generateWithBuildPrompt, toast]);

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
        trackSongPlay();
      }).catch((error) => {
        console.log('Auto-play prevented by browser:', error);
      });
    }
  }, [currentSong?.url]);

  // Initialize queue with simplified logic
  useEffect(() => {
    if (initializationRef.current) {
      console.log('Initialization already in progress, skipping...');
      return;
    }
    
    initializationRef.current = true;
    
    console.log('🎵 INITIALIZATION: Setting up player...');
    setCurrentSong(null);
    setQueue([]);
    
    const initializeQueue = async () => {
      try {
        // Clear the database queue
        await supabase.from('queue').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        console.log('🗂️ Database queue cleared');
        
        // Step 1: Get random genre+mood song to play immediately
        const currentSong = await getRandomGenreMoodSong([]);
        
        if (currentSong) {
          console.log(`✅ Playing: "${currentSong.title}" (${currentSong.genre}-${currentSong.mood})`);
          setCurrentSong(currentSong);
          toast({
            title: "Music Ready!",
            description: `Playing ${currentSong.title}`,
          });
          
          // Step 2: Get a different random genre+mood song for queue
          const nextSong = await getRandomGenreMoodSong([currentSong.id]);
          if (nextSong) {
            console.log(`✅ Queued: "${nextSong.title}" (${nextSong.genre}-${nextSong.mood})`);
            await addSongToQueue(nextSong);
          }
          
          // Step 3: Generate a new song
          console.log('🎵 Generating new song for queue...');
          setTimeout(() => generateNewSong(), 1000);
          
        } else {
          console.error('❌ No songs found in library');
          toast({
            title: "Error",
            description: "No songs available. Please check your music collection.",
            variant: "destructive"
          });
        }
        
      } catch (error) {
        console.error('❌ Error initializing queue:', error);
        toast({
          title: "Error",
          description: "Failed to initialize music queue.",
          variant: "destructive"
        });
      } finally {
        setTimeout(() => {
          initializationRef.current = false;
        }, 2000);
      }
    };
    
    initializeQueue();
    
    // Set up real-time subscription to queue changes
    const queueChannel = supabase
      .channel('queue-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
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

  // Simple: Get random song matching genre + mood
  const getRandomGenreMoodSong = async (excludeIds: string[]): Promise<Song | null> => {
    try {
      const genresLowerCase = selectedGenres.map(g => g.toLowerCase());
      
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
      
      if (selectedMood) {
        query = query.eq('mood', selectedMood.toLowerCase());
      }
      
      if (excludeIds.length > 0) {
        query = query.not('id', 'in', `(${excludeIds.join(',')})`);
      }
      
      const { data: songs, error } = await query.limit(50);
      
      if (error || !songs || songs.length === 0) {
        console.log('No genre+mood songs found');
        return null;
      }
      
      const randomSong = songs[Math.floor(Math.random() * songs.length)];
      console.log(`Selected: ${randomSong.title} (${randomSong.genre} - ${randomSong.mood})`);
      return cleanSongObject(randomSong);
      
    } catch (error) {
      console.error('Error getting random song:', error);
      return null;
    }
  };

  // Helper function to clean song object
  const cleanSongObject = (song: any): Song => {
    return {
      id: song.id,
      title: song.title,
      description: song.description,
      genre: song.genre,
      mood: song.mood,
      url: song.url,
      image_url: song.image_url,
      status: song.status as 'generating' | 'ready' | 'failed',
      prompt: song.prompt,
      created_at: song.created_at,
      updated_at: song.updated_at,
      requested_by: song.requested_by,
      prompt_metadata: song.prompt_metadata || undefined,
      user_interaction: null
    };
  };

  // Simple: Generate new song for current genre + mood
  const generateNewSong = async () => {
    if (generationLockRef.current || isGenerating) {
      console.log('Generation already in progress, skipping...');
      return;
    }
    
    generationLockRef.current = true;
    console.log('🎵 Generating new song for genre + mood...');
    
    try {
      await generateWithBuildPrompt(wildcardMode, instrumentalMode, selectedGenres, selectedMood, true);
    } catch (error) {
      console.error('Error generating song:', error);
    } finally {
      generationLockRef.current = false;
    }
  };

  // Update ref whenever generateNewSong dependencies change
  useEffect(() => {
    generateNewSongRef.current = generateNewSong;
  }, [wildcardMode, instrumentalMode, selectedGenres, selectedMood, isGenerating, generateWithBuildPrompt]);

  const addSongToQueue = async (song: Song) => {
    try {
      const genresLowerCase = selectedGenres.map(g => g.toLowerCase());
      if (genresLowerCase.length > 0 && !genresLowerCase.includes((song.genre || '').toLowerCase())) {
        console.log('Skipping addSongToQueue: song genre does not match selection', song.genre, selectedGenres);
        return;
      }

      // Check if song already in queue
      const { data: existingQueue } = await supabase
        .from('queue')
        .select('id')
        .eq('song_id', song.id)
        .maybeSingle();
        
      if (existingQueue) return;
      
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
        .limit(10);

      if (error) {
        console.error('Error polling for songs:', error);
        return;
      }

      const genresLowerCase = selectedGenres.map(g => g.toLowerCase());

      if (queueData && queueData.length > 0) {
        const items = queueData
          .map(item => ({ song: item.songs as Song | null, queueId: item.id }))
          .filter(item => !!item.song)
          .filter(item => {
            const s = item.song as Song;
            const genreOk = genresLowerCase.length === 0 || genresLowerCase.includes((s.genre || '').toLowerCase());
            const ownerOk = s.requested_by === null || (user?.id ? s.requested_by === user.id : true);
            return genreOk && ownerOk;
          });

        const filteredSongs = items.map(i => i.song!) as Song[];

        if (!currentSong) {
          const firstReady = filteredSongs.find(song => song.status === 'ready' && !!song.url);
          if (firstReady) {
            console.log('Setting first ready filtered song as current:', firstReady);
            setCurrentSong(firstReady);

            const queueItem = queueData.find(item => item.songs?.id === firstReady.id);
            if (queueItem) {
              await supabase.from('queue').delete().eq('id', queueItem.id);
            }

            const idx = filteredSongs.findIndex(s => s.id === firstReady.id);
            if (idx >= 0) filteredSongs.splice(idx, 1);
          }
        }

        setQueue(filteredSongs);
      } else {
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

  const trackSongPlay = async () => {
    if (!currentSong?.id) return;

    try {
      const { error } = await supabase.rpc('track_song_play', {
        _song_id: currentSong.id,
        _user_id: user?.id || null
      });

      if (error) {
        console.error('Error tracking song play:', error);
      }
    } catch (error) {
      console.error('Error tracking song play:', error);
    }
  };

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().then(() => {
          trackSongPlay();
        }).catch(() => {
          toast({
            title: "Playback Error",
            description: "Unable to play audio.",
            variant: "destructive"
          });
        });
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSkip = async () => {
    if (isSkipping) {
      console.log('⏭️ Skip already in progress, ignoring request');
      return;
    }
    
    setIsSkipping(true);
    console.log('⏭️ Skip operation started');
    
    try {
      // Check if there's a ready song in queue
      const { data: readyQueueItems } = await supabase
        .from('queue')
        .select('*, songs(*)')
        .eq('songs.status', 'ready')
        .not('songs.url', 'is', null)
        .order('position');
      
      const readySongs = readyQueueItems?.filter(item => item.songs).map(item => item.songs as Song) || [];
      
      if (readySongs.length > 0) {
        const nextSong = readySongs[0];
        console.log(`✅ Moving to: "${nextSong.title}"`);
        
        // Remove from queue
        const queueItemToRemove = readyQueueItems?.find(item => item.songs?.id === nextSong.id);
        if (queueItemToRemove) {
          await supabase.from('queue').delete().eq('id', queueItemToRemove.id);
        }
        
        setCurrentSong(nextSong);
        setProgress(0);
        
        toast({
          title: 'Next Track',
          description: nextSong.title,
        });
      } else {
        // No ready songs in queue - get one from library
        console.log('⚠️ No ready songs in queue - getting from library');
        const nextSong = await getRandomGenreMoodSong(currentSong ? [currentSong.id] : []);
        
        if (nextSong) {
          console.log(`✅ Playing from library: "${nextSong.title}"`);
          setCurrentSong(nextSong);
          setProgress(0);
          
          toast({
            title: 'Next Track',
            description: nextSong.title,
          });
        } else {
          toast({
            title: "No Next Song",
            description: "No songs available.",
            variant: "destructive"
          });
        }
      }
      
      // Generate a new song after skip
      console.log('🎵 Generating new song after skip...');
      setTimeout(() => generateNewSong(), 500);
      
    } catch (error) {
      console.error('❌ Error in handleSkip:', error);
      toast({
        title: "Skip Error",
        description: "Unable to skip to next song.",
        variant: "destructive"
      });
    } finally {
      setTimeout(() => {
        setIsSkipping(false);
      }, 300);
    }
  };

  const handleLike = async (isLike: boolean) => {
    if (!currentSong || !user) return;

    try {
      const interactionType = isLike ? 'like' : 'dislike';
      
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
          description: "Failed to save your reaction.",
          variant: "destructive"
        });
        return;
      }

      setCurrentInteraction(interactionType);

      if (isLike) {
        toast({
          title: "Liked!",
          description: "We'll play more tracks like this",
        });
      } else {
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
        description: "Failed to save your reaction.",
        variant: "destructive"
      });
    }
  };

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast({
        title: "Error",
        description: "Failed to sign out.",
        variant: "destructive"
      });
    } else {
      onBack();
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
      await supabase.functions.invoke('check-stuck-songs');

      const result = await generateWithBuildPrompt(
        wildcardMode,
        instrumentalMode,
        selectedGenres,
        selectedMood,
        true
      );

      if (result?.success) {
        toast({ title: 'Generating…', description: 'Started a new track' });
        await pollForNewSongs();
      } else if (result && result.error?.toLowerCase().includes('concurrency')) {
        toast({ title: 'Please wait', description: 'A track is already generating' });
      }
    } catch (error) {
      console.error('Error starting generation:', error);
      toast({ title: 'Error', description: 'Failed to start music generation', variant: 'destructive' });
    } finally {
      setIsRefreshing(false);
      setTimeout(() => { generationLockRef.current = false; }, 3000);
    }
  };

  const handleSettingsSave = (newSettings: {
    genres: string[];
    mood?: string;
    instrumentalMode: boolean;
    wildcardMode: boolean;
    generateWhenExhausted: boolean;
  }) => {
    if (newSettings.wildcardMode !== preferences.wild_card_mode) {
      toggleWildCardMode();
    }
    
    if (newSettings.generateWhenExhausted !== preferences.generate_when_exhausted) {
      updatePreferences({ generate_when_exhausted: newSettings.generateWhenExhausted });
    }
    
    onSettingsUpdate?.({
      genres: newSettings.genres,
      mood: newSettings.mood,
      instrumentalMode: newSettings.instrumentalMode,
      wildcardMode: newSettings.wildcardMode
    });
    
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
                disabled={isSkipping || (!currentSong && queue.length === 0)}
                title={
                  isSkipping 
                    ? "Finding next song..." 
                    : queue.length === 0 && !currentSong
                    ? "No songs available"
                    : "Skip to next song"
                }
              >
                {isSkipping ? (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                ) : (
                  <SkipForward className="h-5 w-5" />
                )}
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

      <SettingsPopup
        isOpen={showSettingsPopup}
        onClose={() => setShowSettingsPopup(false)}
        currentGenres={selectedGenres}
        currentMood={selectedMood}
        instrumentalMode={instrumentalMode}
        wildcardMode={wildcardMode}
        generateWhenExhausted={preferences.generate_when_exhausted}
        onSaveSettings={handleSettingsSave}
      />
    </div>
  );
}
