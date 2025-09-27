import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { 
  Play, Pause, SkipForward, ThumbsUp, ThumbsDown, 
  Settings, Music, Clock, Volume2, ArrowLeft 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Song {
  id: string;
  title: string;
  description: string;
  genre: string;
  mood?: string;
  url?: string;
  status: 'generating' | 'ready' | 'playing' | 'finished';
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

  // Initialize with first song
  useEffect(() => {
    generateInitialSongs();
  }, [selectedGenres, selectedMood]);

  const generateInitialSongs = async () => {
    // Mock initial songs generation
    const mockSongs: Song[] = [
      {
        id: '1',
        title: `${selectedGenres[0]} Vibes`,
        description: `A ${selectedMood || 'beautiful'} ${selectedGenres[0].toLowerCase()} track`,
        genre: selectedGenres[0],
        mood: selectedMood,
        status: 'ready',
        url: '/placeholder-audio.mp3' // This would be replaced with actual Suno API URL
      },
      {
        id: '2',
        title: 'AI Generated Mix',
        description: 'Next track generating...',
        genre: selectedGenres[Math.floor(Math.random() * selectedGenres.length)],
        mood: selectedMood,
        status: 'generating'
      }
    ];
    
    setCurrentSong(mockSongs[0]);
    setQueue(mockSongs.slice(1));
    
    toast({
      title: "Radio Started!",
      description: `Playing ${selectedGenres.join(", ")} ${selectedMood ? `(${selectedMood})` : ''}`,
    });
  };

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

  const generateNextSong = () => {
    // Mock next song generation
    const newSong: Song = {
      id: Date.now().toString(),
      title: `AI Mix ${Math.floor(Math.random() * 1000)}`,
      description: `Another ${selectedMood || 'amazing'} track`,
      genre: selectedGenres[Math.floor(Math.random() * selectedGenres.length)],
      mood: selectedMood,
      status: 'generating'
    };
    
    setQueue(prev => [...prev, newSong]);
    
    // Simulate generation completion
    setTimeout(() => {
      setQueue(prev => prev.map(song => 
        song.id === newSong.id 
          ? { ...song, status: 'ready', url: '/placeholder-audio.mp3' }
          : song
      ));
    }, 3000);
  };

  const handleLike = (isLike: boolean) => {
    toast({
      title: isLike ? "Liked!" : "Disliked",
      description: isLike 
        ? "We'll play more tracks like this" 
        : "We'll avoid similar tracks in the future",
    });
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
        <Button variant="ghost" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
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
                  <Badge variant={song.status === 'ready' ? 'default' : 'secondary'}>
                    {song.status === 'ready' ? 'Ready' : 'Generating...'}
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