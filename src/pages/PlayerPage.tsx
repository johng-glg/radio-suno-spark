import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { 
  Play, Pause, SkipForward, ThumbsUp, ThumbsDown, 
  Settings, Music, Clock, Volume2, ArrowLeft, LogOut, User
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useMusicGeneration } from "@/hooks/useMusicGeneration";
import { supabase } from "@/integrations/supabase/client";

interface Song {
  id: string;
  title: string;
  description?: string;
  genre: string;
  mood?: string;
  url?: string;
  status: 'generating' | 'completed' | 'failed';
  prompt?: string;
  created_at?: string;
  updated_at?: string;
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
  const audioRef = useRef<HTMLAudioElement>(null);
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const { generateMusic, isGenerating } = useMusicGeneration();

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
    loadQueueFromDatabase();
    generateInitialSongs();
  }, [selectedGenres, selectedMood]);

  const loadQueueFromDatabase = async () => {
    try {
      // Load existing queue from database
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
        if (songs.length > 0) {
          setCurrentSong(songs[0]);
          setQueue(songs.slice(1));
          return; // Don't generate initial songs if we have existing queue
        }
      }
    } catch (error) {
      console.error('Error loading queue from database:', error);
    }
  };

  const generateInitialSongs = async () => {
    if (currentSong) return; // Don't generate if we already have songs from database
    
    // Create prompts based on selected preferences
    const genre = selectedGenres[0];
    const moodText = selectedMood ? ` with a ${selectedMood} mood` : '';
    const prompt = `Create a ${genre.toLowerCase()} track${moodText}. Make it engaging and radio-friendly.`;
    
    console.log('Generating initial song with prompt:', prompt);
    
    const result = await generateMusic({
      prompt,
      genre,
      mood: selectedMood,
      title: `${genre} Radio Track`,
      make_instrumental: Math.random() > 0.7 // 30% chance of instrumental
    });

    if (result?.success && result.song_id) {
      // Poll for the song to be completed and added to queue
      pollForNewSongs();
      
      toast({
        title: "Radio Started!",
        description: `Generating ${genre} ${selectedMood ? `(${selectedMood})` : ''} tracks...`,
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
        const completedSongs = songs.filter(song => song.status === 'completed' && song.url);
        
        if (completedSongs.length > 0 && !currentSong) {
          setCurrentSong(completedSongs[0]);
          setQueue(completedSongs.slice(1));
        } else if (completedSongs.length > 0) {
          setQueue(completedSongs.slice(currentSong ? 1 : 0));
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
    
    await generateMusic({
      prompt,
      genre,
      mood: selectedMood,
      title: `${genre} Mix`,
      make_instrumental: Math.random() > 0.6 // 40% chance of instrumental
    });
  };

  const handleLike = (isLike: boolean) => {
    toast({
      title: isLike ? "Liked!" : "Disliked",
      description: isLike 
        ? "We'll play more tracks like this" 
        : "We'll avoid similar tracks in the future",
    });
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
              <h2 className="text-2xl font-bold">{currentSong?.title || "Loading..."}</h2>
              <p className="text-muted-foreground">{currentSong?.description}</p>
              <div className="flex items-center justify-center space-x-2">
                {selectedGenres.map(genre => (
                  <Badge key={genre} variant="secondary">{genre}</Badge>
                ))}
                {selectedMood && (
                  <Badge variant="outline">{selectedMood}</Badge>
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
            </h3>
            <div className="space-y-3">
              {queue.slice(0, 3).map((song, index) => (
                <div key={song.id} className="flex items-center space-x-3 p-3 rounded-lg bg-muted/20">
                  <div className="w-2 h-2 rounded-full bg-primary/60" />
                  <div className="flex-1">
                    <p className="font-medium">{song.title}</p>
                    <p className="text-sm text-muted-foreground">{song.description}</p>
                  </div>
                  <Badge variant={song.status === 'completed' ? 'default' : 'secondary'}>
                    {song.status === 'completed' ? 'Ready' : 'Generating...'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}