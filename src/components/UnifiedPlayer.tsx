import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { 
  Play, Pause, SkipForward, ThumbsUp, ThumbsDown, Volume2, Music, ListPlus, Info, Shuffle
} from "lucide-react";
import { useAudioPlayer } from "@/contexts/AudioContext";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AddToPlaylistDialog } from "./AddToPlaylistDialog";

export default function UnifiedPlayer() {
  const { currentSong, isPlaying, progress, duration, volume, setVolume, resume, pause, activeContext, isShuffled, toggleShuffle } = useAudioPlayer();
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentInteraction, setCurrentInteraction] = useState<'like' | 'dislike' | null>(null);
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
  
  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      pause();
    } else {
      resume();
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
        return;
      }

      setCurrentInteraction(interactionType);
      toast({
        title: isLike ? "Liked!" : "Disliked",
        description: isLike ? "We'll play more tracks like this" : "We'll avoid similar tracks",
      });
    } catch (error) {
      console.error('Failed to save interaction:', error);
    }
  };

  if (!currentSong) {
    return (
      <Card className="bg-card/30 backdrop-blur-sm border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-center gap-3 text-muted-foreground">
            <Music className="h-5 w-5" />
            <p className="text-sm">No song playing</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row items-center gap-4">
            {/* Album Art */}
            <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0">
              {currentSong.image_url ? (
                <img
                  src={currentSong.image_url}
                  alt={currentSong.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music className="h-8 w-8 text-muted-foreground/50" />
                </div>
              )}
            </div>

            {/* Song Info */}
            <div className="flex-1 min-w-0 text-center md:text-left">
              <h3 className="font-semibold text-lg truncate">{currentSong.title}</h3>
              <div className="flex items-center justify-center md:justify-start gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">{currentSong.genre}</Badge>
                {currentSong.mood && (
                  <Badge variant="outline" className="text-xs">{currentSong.mood}</Badge>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 transition-colors ${currentInteraction === 'like' ? 'text-green-400' : ''}`}
                onClick={() => handleLike(true)}
                disabled={!user}
              >
                <ThumbsUp className="h-4 w-4" />
              </Button>

              <Button
                size="icon"
                className="h-12 w-12 rounded-full"
                onClick={handlePlayPause}
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 transition-colors ${currentInteraction === 'dislike' ? 'text-red-400' : ''}`}
                onClick={() => handleLike(false)}
                disabled={!user}
              >
                <ThumbsDown className="h-4 w-4" />
              </Button>

              {activeContext === 'playlist' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 transition-colors ${isShuffled ? 'text-primary' : ''}`}
                  onClick={toggleShuffle}
                  title={isShuffled ? "Shuffle On" : "Shuffle Off"}
                >
                  <Shuffle className="h-4 w-4" />
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowAddToPlaylist(true)}
                disabled={!user}
                title="Add to Playlist"
              >
                <ListPlus className="h-4 w-4" />
              </Button>
            </div>

            {/* Volume Control */}
            <div className="hidden lg:flex items-center gap-2 w-32">
              <Volume2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Slider
                value={[volume]}
                onValueChange={(v) => setVolume(v[0])}
                max={100}
                step={1}
                className="flex-1"
              />
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-3 space-y-1">
            <div className="progress-bar h-1">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatTime((progress / 100) * duration)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <AddToPlaylistDialog
        open={showAddToPlaylist}
        onOpenChange={setShowAddToPlaylist}
        song={currentSong ? { id: currentSong.id, title: currentSong.title } : null}
      />
    </>
  );
}
