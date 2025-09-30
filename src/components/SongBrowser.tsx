import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Pause, Music, Snowflake, Ghost, Clover, Flag, Heart, ListPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { AddToPlaylistDialog } from "./AddToPlaylistDialog";

interface Song {
  id: string;
  title: string;
  genre: string;
  mood: string;
  url: string;
  image_url: string | null;
  holiday: string | null;
  total_plays: number;
  likes_count: number;
  user_liked: boolean;
}

const GENRES = ["all", "classical", "country", "edm", "hip-hop", "jazz", "pop", "rock"];
const MOODS = ["all", "upbeat", "chill", "aggressive", "emotional", "epic", "playful"];
const HOLIDAYS = ["all", "Christmas", "Halloween", "Hanukkah", "Thanksgiving", "St. Patty's Day", "4th of July"];

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
  const [holidayFilter, setHolidayFilter] = useState("all");
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [audioDurations, setAudioDurations] = useState<Record<string, number>>({});
  const [selectedSongForPlaylist, setSelectedSongForPlaylist] = useState<Song | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchSongs();
  }, [genreFilter, moodFilter, holidayFilter]);

  const fetchSongs = async () => {
    setLoading(true);
    try {
      // First, get songs with filters
      let query = supabase
        .from('songs')
        .select('id, title, genre, mood, url, image_url, holiday')
        .eq('is_public', true)
        .in('status', ['ready', 'completed'])
        .not('url', 'is', null)
        .limit(200);

      if (genreFilter !== "all") {
        query = query.ilike('genre', genreFilter);
      }
      if (moodFilter !== "all") {
        query = query.ilike('mood', moodFilter);
      }
      if (holidayFilter !== "all") {
        query = query.eq('holiday', holidayFilter);
      }

      const { data: songsData, error: songsError } = await query;
      if (songsError) throw songsError;

      if (!songsData || songsData.length === 0) {
        setSongs([]);
        setLoading(false);
        return;
      }

      // Get play counts
      const { data: playsData } = await supabase
        .from('user_song_plays')
        .select('song_id, play_count');

      // Get like counts
      const { data: likesData } = await supabase
        .from('user_song_interactions')
        .select('song_id, user_id')
        .eq('interaction_type', 'like');

      // Get user's likes if logged in
      const userLikes = new Set<string>();
      if (user) {
        likesData?.forEach(like => {
          if (like.user_id === user.id) {
            userLikes.add(like.song_id);
          }
        });
      }

      // Aggregate plays and likes
      const playCountMap = new Map<string, number>();
      playsData?.forEach(play => {
        const current = playCountMap.get(play.song_id) || 0;
        playCountMap.set(play.song_id, current + play.play_count);
      });

      const likeCountMap = new Map<string, number>();
      likesData?.forEach(like => {
        const current = likeCountMap.get(like.song_id) || 0;
        likeCountMap.set(like.song_id, current + 1);
      });

      // Combine data
      const enrichedSongs = songsData.map(song => ({
        ...song,
        total_plays: playCountMap.get(song.id) || 0,
        likes_count: likeCountMap.get(song.id) || 0,
        user_liked: userLikes.has(song.id),
      }));

      // Sort by play count (descending)
      enrichedSongs.sort((a, b) => b.total_plays - a.total_plays);

      setSongs(enrichedSongs);
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

  const handlePlayPause = async (song: Song) => {
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
      
      // Track play
      try {
        await supabase.rpc('track_song_play', {
          _song_id: song.id,
          _user_id: user?.id || null
        });
      } catch (error) {
        console.error('Failed to track play:', error);
      }
      
      toast({
        title: "Now Playing",
        description: song.title,
      });
    }
  };

  const handleLike = async (song: Song, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to like songs",
        variant: "destructive",
      });
      return;
    }

    try {
      if (song.user_liked) {
        // Unlike
        await supabase
          .from('user_song_interactions')
          .delete()
          .eq('user_id', user.id)
          .eq('song_id', song.id)
          .eq('interaction_type', 'like');
        
        setSongs(prev => prev.map(s => 
          s.id === song.id 
            ? { ...s, user_liked: false, likes_count: s.likes_count - 1 }
            : s
        ));
      } else {
        // Like
        await supabase
          .from('user_song_interactions')
          .insert({
            user_id: user.id,
            song_id: song.id,
            interaction_type: 'like'
          });
        
        setSongs(prev => prev.map(s => 
          s.id === song.id 
            ? { ...s, user_liked: true, likes_count: s.likes_count + 1 }
            : s
        ));
      }
    } catch (error) {
      console.error('Failed to toggle like:', error);
      toast({
        title: "Error",
        description: "Failed to update like",
        variant: "destructive",
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
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[150px]">
          <Select value={genreFilter} onValueChange={setGenreFilter}>
            <SelectTrigger className="bg-card/50 backdrop-blur-sm">
              <SelectValue placeholder="Genre" />
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
        
        <div className="flex-1 min-w-[150px]">
          <Select value={moodFilter} onValueChange={setMoodFilter}>
            <SelectTrigger className="bg-card/50 backdrop-blur-sm">
              <SelectValue placeholder="Mood" />
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

        <div className="flex-1 min-w-[150px]">
          <Select value={holidayFilter} onValueChange={setHolidayFilter}>
            <SelectTrigger className="bg-card/50 backdrop-blur-sm">
              <SelectValue placeholder="Holiday" />
            </SelectTrigger>
            <SelectContent>
              {HOLIDAYS.map(holiday => (
                <SelectItem key={holiday} value={holiday}>
                  {holiday}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Song Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="bg-card/50 backdrop-blur-sm">
              <CardContent className="p-3">
                <Skeleton className="h-32 w-full mb-3" />
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2" />
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
              <CardContent className="p-3">
                {/* Album Art */}
                <div className="relative mb-3 rounded-md overflow-hidden aspect-square bg-muted">
                  {song.image_url ? (
                    <img 
                      src={song.image_url} 
                      alt={song.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music className="h-10 w-10 text-muted-foreground/50" />
                    </div>
                  )}
                  
                  {/* Play/Pause Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-10 w-10 rounded-full"
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
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-xs line-clamp-2 flex-1">
                      {song.title}
                    </h3>
                    {song.holiday && (
                      <div className="flex-shrink-0">
                        {getHolidayIcon(song.holiday)}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <div className="flex gap-1.5">
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

                  {/* Stats & Actions */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Play className="h-3 w-3" />
                        <span>{song.total_plays}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Heart className="h-3 w-3" />
                        <span>{song.likes_count}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={(e) => handleLike(song, e)}
                      >
                        <Heart 
                          className={`h-3.5 w-3.5 ${song.user_liked ? 'fill-red-500 text-red-500' : ''}`}
                        />
                      </Button>
                      {user && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSongForPlaylist(song);
                          }}
                        >
                          <ListPlus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <AddToPlaylistDialog
        song={selectedSongForPlaylist}
        open={!!selectedSongForPlaylist}
        onOpenChange={(open) => !open && setSelectedSongForPlaylist(null)}
      />
    </div>
  );
}
