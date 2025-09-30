import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Pause, Music, Snowflake, Ghost, Clover, Flag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

interface Song {
  id: string;
  title: string;
  genre: string;
  mood: string;
  url: string;
  image_url: string | null;
  holiday: string | null;
}

const GENRES = ["all", "classical", "country", "edm", "hip-hop", "jazz", "pop", "rock"];
const MOODS = ["all", "upbeat", "chill", "aggressive", "emotional", "epic", "playful"];

const HOLIDAY_ICONS: Record<string, any> = {
  "Christmas": Snowflake,
  "Halloween": Ghost,
  "Hanukkah": "🕎",
  "Thanksgiving": "🍗",
  "St. Patty's Day": Clover,
  "4th of July": Flag,
};

export default function SongBrowser() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [genreFilter, setGenreFilter] = useState("all");
  const [moodFilter, setMoodFilter] = useState("all");
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [audioDurations, setAudioDurations] = useState<Record<string, number>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchSongs();
  }, [genreFilter, moodFilter]);

  const fetchSongs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('songs')
        .select('id, title, genre, mood, url, image_url, holiday')
        .eq('is_public', true)
        .in('status', ['ready', 'completed'])
        .not('url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (genreFilter !== "all") {
        query = query.ilike('genre', genreFilter);
      }
      if (moodFilter !== "all") {
        query = query.ilike('mood', moodFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setSongs(data || []);
    } catch (error) {
      console.error('Error fetching songs:', error);
      toast({
        title: "Error",
        description: "Failed to load songs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAudioDuration = (songId: string, url: string) => {
    if (audioDurations[songId]) return;

    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      setAudioDurations(prev => ({
        ...prev,
        [songId]: audio.duration
      }));
    });
  };

  useEffect(() => {
    songs.forEach(song => {
      if (song.url) {
        loadAudioDuration(song.id, song.url);
      }
    });
  }, [songs]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = (song: Song) => {
    if (playingSongId === song.id) {
      audioRef.current?.pause();
      setPlayingSongId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = new Audio(song.url);
      audioRef.current.play();
      audioRef.current.onended = () => setPlayingSongId(null);
      setPlayingSongId(song.id);
      
      toast({
        title: "Now Playing",
        description: song.title,
      });
    }
  };

  const getHolidayIcon = (holiday: string | null) => {
    if (!holiday) return null;
    const icon = HOLIDAY_ICONS[holiday];
    if (!icon) return null;
    
    if (typeof icon === 'string') {
      return <span className="text-xl">{icon}</span>;
    }
    const Icon = icon;
    return <Icon className="h-5 w-5 text-primary" />;
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <Select value={genreFilter} onValueChange={setGenreFilter}>
            <SelectTrigger className="bg-card/50 backdrop-blur-sm">
              <SelectValue placeholder="Filter by genre" />
            </SelectTrigger>
            <SelectContent>
              {GENRES.map(genre => (
                <SelectItem key={genre} value={genre}>
                  {genre.charAt(0).toUpperCase() + genre.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex-1 min-w-[200px]">
          <Select value={moodFilter} onValueChange={setMoodFilter}>
            <SelectTrigger className="bg-card/50 backdrop-blur-sm">
              <SelectValue placeholder="Filter by mood" />
            </SelectTrigger>
            <SelectContent>
              {MOODS.map(mood => (
                <SelectItem key={mood} value={mood}>
                  {mood.charAt(0).toUpperCase() + mood.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Song Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="bg-card/50 backdrop-blur-sm">
              <CardContent className="p-4">
                <Skeleton className="h-48 w-full mb-4" />
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))
        ) : songs.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <Music className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No songs found with the selected filters</p>
          </div>
        ) : (
          songs.map(song => (
            <Card key={song.id} className="bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-all group">
              <CardContent className="p-4">
                {/* Album Art */}
                <div className="relative mb-4 rounded-lg overflow-hidden aspect-square bg-muted">
                  {song.image_url ? (
                    <img 
                      src={song.image_url} 
                      alt={song.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music className="h-16 w-16 text-muted-foreground/50" />
                    </div>
                  )}
                  
                  {/* Play/Pause Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-14 w-14 rounded-full"
                      onClick={() => handlePlayPause(song)}
                    >
                      {playingSongId === song.id ? (
                        <Pause className="h-6 w-6" />
                      ) : (
                        <Play className="h-6 w-6 ml-1" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Song Info */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm line-clamp-2 flex-1">
                      {song.title}
                    </h3>
                    {song.holiday && (
                      <div className="flex-shrink-0">
                        {getHolidayIcon(song.holiday)}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex gap-2">
                      <span className="capitalize">{song.genre}</span>
                      <span>•</span>
                      <span className="capitalize">{song.mood}</span>
                    </div>
                    {audioDurations[song.id] && (
                      <span className="font-mono">
                        {formatDuration(audioDurations[song.id])}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
