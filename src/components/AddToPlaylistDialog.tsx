import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface Playlist {
  id: string;
  name: string;
  created_at: string;
}

interface AddToPlaylistDialogProps {
  song: { id: string; title: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddToPlaylistDialog({ song, open, onOpenChange }: AddToPlaylistDialogProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [addedPlaylists, setAddedPlaylists] = useState<Set<string>>(new Set());
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (open && user) {
      fetchPlaylists();
      if (song) {
        checkExistingPlaylistSongs();
      }
    }
  }, [open, user, song]);

  const fetchPlaylists = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('playlists')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setPlaylists(data);
    }
  };

  const checkExistingPlaylistSongs = async () => {
    if (!user || !song) return;

    const { data } = await supabase
      .from('playlist_songs')
      .select('playlist_id')
      .eq('song_id', song.id);

    if (data) {
      setAddedPlaylists(new Set(data.map(ps => ps.playlist_id)));
    }
  };

  const createPlaylist = async () => {
    if (!user || !newPlaylistName.trim()) return;

    const { data, error } = await supabase
      .from('playlists')
      .insert({
        user_id: user.id,
        name: newPlaylistName.trim()
      })
      .select()
      .single();

    if (error) {
      toast({
        title: "Error",
        description: "Failed to create playlist",
        variant: "destructive",
      });
      return;
    }

    if (data && song) {
      await addToPlaylist(data.id);
    }

    setNewPlaylistName("");
    setShowNewPlaylist(false);
    fetchPlaylists();
  };

  const addToPlaylist = async (playlistId: string) => {
    if (!song) return;

    const isAlreadyAdded = addedPlaylists.has(playlistId);

    if (isAlreadyAdded) {
      // Remove from playlist
      const { error } = await supabase
        .from('playlist_songs')
        .delete()
        .eq('playlist_id', playlistId)
        .eq('song_id', song.id);

      if (error) {
        toast({
          title: "Error",
          description: "Failed to remove from playlist",
          variant: "destructive",
        });
        return;
      }

      setAddedPlaylists(prev => {
        const newSet = new Set(prev);
        newSet.delete(playlistId);
        return newSet;
      });

      toast({
        title: "Removed",
        description: "Song removed from playlist",
      });
    } else {
      // Add to playlist
      const { error } = await supabase
        .from('playlist_songs')
        .insert({
          playlist_id: playlistId,
          song_id: song.id,
          position: 0
        });

      if (error) {
        toast({
          title: "Error",
          description: "Failed to add to playlist",
          variant: "destructive",
        });
        return;
      }

      setAddedPlaylists(prev => new Set(prev).add(playlistId));

      toast({
        title: "Added",
        description: "Song added to playlist",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Playlist</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {song && (
            <p className="text-sm text-muted-foreground">
              Adding: <span className="font-medium">{song.title}</span>
            </p>
          )}

          <ScrollArea className="h-[200px] pr-4">
            <div className="space-y-2">
              {playlists.map((playlist) => (
                <Button
                  key={playlist.id}
                  variant={addedPlaylists.has(playlist.id) ? "secondary" : "outline"}
                  className="w-full justify-between"
                  onClick={() => addToPlaylist(playlist.id)}
                >
                  <span>{playlist.name}</span>
                  {addedPlaylists.has(playlist.id) && (
                    <Check className="h-4 w-4" />
                  )}
                </Button>
              ))}

              {playlists.length === 0 && !showNewPlaylist && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No playlists yet. Create your first one!
                </p>
              )}
            </div>
          </ScrollArea>

          {showNewPlaylist ? (
            <div className="space-y-2">
              <Label htmlFor="playlist-name">Playlist Name</Label>
              <div className="flex gap-2">
                <Input
                  id="playlist-name"
                  placeholder="My Playlist"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createPlaylist()}
                />
                <Button onClick={createPlaylist} disabled={!newPlaylistName.trim()}>
                  Create
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowNewPlaylist(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Playlist
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
