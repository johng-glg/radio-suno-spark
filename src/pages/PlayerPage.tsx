import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Play, Pause, SkipForward, ThumbsUp, ThumbsDown, 
  Settings, Music, Clock, Volume2, ArrowLeft, LogOut, User, Sparkles, Info
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
}

interface PlayerPageProps {
  selectedGenres: string[];
  selectedMood?: string;
  onBack: () => void;
}

export default function PlayerPage({ selectedGenres, selectedMood, onBack }: PlayerPageProps) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState([80]);
  const [showPromptInfo, setShowPromptInfo] = useState(false);
  const [lastDislikedElements, setLastDislikedElements] = useState<{mood?: string, instrument?: string}>({});
  const audioRef = useRef<HTMLAudioElement>(null);
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const { generateWithBuildPrompt, isGenerating } = useMusicGeneration();
  const { preferences, toggleWildCardMode, addExclusion } = useUserPreferences();
  

  // Mock audio element setup
  useEffect(() => {
    if (audioRef.current) {
      const audio = audioRef.current;
      
      const handleLoadedMetadata = () => {
        setDuration(audio.duration);
      };
      
      const handleTimeUpdate = () => {
        setProgress((audio.currentTime / audio.duration) * 100);
      };
      
      const handleEnded = () => {
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

  // Initialize with first song and load queue from database
  useEffect(() => {
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
      // First, try to load any existing ready songs from the queue
      const { data: queueData, error } = await supabase
        .from('queue')
        .select(`
          id,
          position,
          status,
          songs (
            id,
            title,
            description,
            genre,
            mood,
            url,
            status,
            prompt,
            created_at,
            updated_at
          )
        `)
        .order('position', { ascending: true });

      if (error) {
        console.error('Error loading queue:', error);
        return;
      }

      if (queueData && queueData.length > 0) {
        const songs = queueData.map(item => item.songs).filter(Boolean) as Song[];
        const readySongs = songs.filter(song => song.status === 'ready' && song.url);
        
        if (readySongs.length > 0) {
          console.log('Found existing ready songs in queue:', readySongs.length);
          setCurrentSong(readySongs[0]);
          setQueue(readySongs.slice(1));
          return true; // Return true to indicate we found existing songs
        }
      }
      
      // If no ready songs in queue, try to find pre-made songs for current genres
      if (selectedGenres.length > 0) {
        console.log('Looking for pre-made songs for genres:', selectedGenres);
        
        const { data: premadeSongs, error: premadeError } = await supabase
          .from('songs')
          .select('*')
          .eq('status', 'ready')
          .in('genre', selectedGenres)
          .not('url', 'is', null)
          .order('created_at', { ascending: true })
          .limit(5);

        if (premadeError) {
          console.error('Error loading pre-made songs:', premadeError);
          return false;
        }

         if (premadeSongs && premadeSongs.length > 0) {
           console.log('Found pre-made songs:', premadeSongs.length);
           
           // Show immediate feedback for instant playback
           toast({
             title: "Music Ready!",
             description: `Playing ${premadeSongs[0].title} instantly while generating new tracks...`,
           });
           
           // Add these songs to the queue if not already there
           const songsToQueue = [];
           for (const song of premadeSongs) {
             const { data: existingQueue } = await supabase
               .from('queue')
               .select('id')
               .eq('song_id', song.id)
               .maybeSingle();
               
             if (!existingQueue) {
               songsToQueue.push(song);
             }
           }
           
           if (songsToQueue.length > 0) {
             // Get next position
             const { data: queueCount } = await supabase
               .from('queue')
               .select('position')
               .order('position', { ascending: false })
               .limit(1);
               
             let nextPosition = queueCount && queueCount.length > 0 ? queueCount[0].position + 1 : 1;
             
             // Add to queue
             const queueInserts = songsToQueue.map(song => ({
               song_id: song.id,
               position: nextPosition++,
               status: 'queued'
             }));
             
             await supabase.from('queue').insert(queueInserts);
           }
           
           setCurrentSong(premadeSongs[0] as Song);
           setQueue(premadeSongs.slice(1) as Song[]);
           return true;
         }
      }
      
      return false; // No existing songs found
    } catch (error) {
      console.error('Error loading queue from database:', error);
      return false;
    }
  };

  const generateInitialSongs = async () => {
    // Always check for existing songs first
    const hasExistingSongs = await loadQueueFromDatabase();
    
    if (hasExistingSongs) {
      console.log('Using existing songs, generating new ones in background');
      // Generate new songs in the background while playing existing ones
      setTimeout(() => {
        generateWithBuildPrompt(preferences.wild_card_mode);
      }, 2000); // Small delay to let the UI load
      return;
    }
    
    console.log('No existing songs found, generating initial songs');
    
    try {
      const result = await generateWithBuildPrompt(preferences.wild_card_mode);

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
    if (queue.length >= 3 || isGenerating) return; // Don't generate if queue is full or already generating
    
    const genre = selectedGenres[Math.floor(Math.random() * selectedGenres.length)];
    const moodText = selectedMood ? ` with a ${selectedMood} mood` : '';
    const prompt = `Create a ${genre.toLowerCase()} track${moodText}. Make it unique and different from previous tracks.`;
    
    console.log('Generating next song:', { genre, mood: selectedMood, prompt });
    
    await generateWithBuildPrompt(preferences.wild_card_mode);
  };

  const handleLike = (isLike: boolean) => {
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
                {preferences.wild_card_mode && (
                  <Badge variant="outline" className="text-yellow-400 border-yellow-400/50">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Wild Card
                  </Badge>
                )}
              </div>
            </div>

            {/* Album Art / Waveform */}
            <div className="w-48 h-48 mx-auto bg-radio-surface rounded-lg flex items-center justify-center neon-glow">
              <WaveformBars />
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
                onClick={() => handleLike(false)}
              >
                <ThumbsDown className="h-5 w-5" />
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
              >
                <SkipForward className="h-5 w-5" />
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                className="player-control"
                onClick={() => handleLike(true)}
              >
                <ThumbsUp className="h-5 w-5" />
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
            <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>Coming Up</span>
              {isGenerating && (
                <Badge variant="secondary" className="ml-2">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse mr-1" />
                  Generating...
                </Badge>
              )}
            </h3>
            <div className="space-y-3">
              {queue.slice(0, 3).map((song, index) => (
                <div key={song.id} className="flex items-center space-x-3 p-3 rounded-lg bg-muted/20">
                  <div className="w-2 h-2 rounded-full bg-primary/60" />
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
              {queue.length === 0 && !isGenerating && (
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