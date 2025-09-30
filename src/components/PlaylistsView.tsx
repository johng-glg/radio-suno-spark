import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Plus, Music, Play, Pause, Trash2, ListMusic, X 
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Playlist {
  id: string;
  name: string;
  created_at: string;
}

interface PlaylistSong {
  id: string;
  song_id: string;
  songs: {
    id: string;
    title: string;
    genre: string;
    mood: string;
    url: string;
    image_url: string | null;
  };
}

export default function PlaylistsView() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [playlistSongs, setPlaylistSongs] = useState<PlaylistSong[]>([]);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [deletePlaylistId, setDeletePlaylistId] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchPlaylists();
    }
  }, [user]);

  useEffect(() => {
    if (selectedPlaylist) {
      fetchPlaylistSongs(selectedPlaylist.id);
    }
  }, [selectedPlaylist]);

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

  const fetchPlaylistSongs = async (playlistId: string) => {
    const { data, error } = await supabase
      .from('playlist_songs')
      .select(`
        id,
        song_id,
        songs (
          id,
          title,
          genre,
          mood,
          url,
          image_url
        )
      `)
      .eq('playlist_id', playlistId)
      .order('added_at', { ascending: false });

    if (!error && data) {
      setPlaylistSongs(data as PlaylistSong[]);
    }
  };

  const createPlaylist = async () => {
    if (!user || !newPlaylistName.trim()) return;

    const { error } = await supabase
      .from('playlists')
      .insert({
        user_id: user.id,
        name: newPlaylistName.trim()
      });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to create playlist",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: "Playlist created",
    });

    setNewPlaylistName("");
    setShowNewPlaylist(false);
    fetchPlaylists();
  };

  const deletePlaylist = async (playlistId: string) => {
    const { error } = await supabase
      .from('playlists')
      .delete()
      .eq('id', playlistId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete playlist",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Deleted",
      description: "Playlist deleted",
    });

    if (selectedPlaylist?.id === playlistId) {
      setSelectedPlaylist(null);
      setPlaylistSongs([]);
    }

    fetchPlaylists();
    setDeletePlaylistId(null);
  };

  const removeSongFromPlaylist = async (playlistSongId: string) => {
    const { error } = await supabase
      .from('playlist_songs')
      .delete()
      .eq('id', playlistSongId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to remove song",
        variant: "destructive",
      });
      return;
    }

    if (selectedPlaylist) {
      fetchPlaylistSongs(selectedPlaylist.id);
    }
  };

  const handlePlayPause = async (song: any) => {
    if (playingSongId === song.id) {
      audioElement?.pause();
      setPlayingSongId(null);
    } else {
      if (audioElement) {
        audioElement.pause();
      }
      const audio = new Audio(song.url);
      audio.play();
      audio.onended = () => setPlayingSongId(null);
      setAudioElement(audio);
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
    }
  };

  if (!user) {
    return (
      <div className="text-center py-12">
        <ListMusic className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-muted-foreground">Sign in to create and manage playlists</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Playlists List */}
      {!selectedPlaylist ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">My Playlists</h2>
            <Button onClick={() => setShowNewPlaylist(!showNewPlaylist)}>
              <Plus className="h-4 w-4 mr-2" />
              New Playlist
            </Button>
          </div>

          {showNewPlaylist && (
            <Card className="mb-4 bg-card/50 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Playlist name"
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createPlaylist()}
                  />
                  <Button onClick={createPlaylist} disabled={!newPlaylistName.trim()}>
                    Create
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {playlists.length === 0 ? (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                <ListMusic className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No playlists yet. Create your first one!</p>
              </div>
            ) : (
              playlists.map((playlist) => (
                <Card
                  key={playlist.id}
                  className="bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-all cursor-pointer group"
                  onClick={() => setSelectedPlaylist(playlist)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="p-3 rounded-lg bg-primary/10">
                          <ListMusic className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{playlist.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {new Date(playlist.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletePlaylistId(playlist.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Selected Playlist View */
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setSelectedPlaylist(null)}>
                <X className="h-4 w-4" />
              </Button>
              <h2 className="text-2xl font-bold">{selectedPlaylist.name}</h2>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeletePlaylistId(selectedPlaylist.id)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Playlist
            </Button>
          </div>

          <ScrollArea className="h-[500px]">
            <div className="space-y-2">
              {playlistSongs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Music className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No songs in this playlist yet</p>
                </div>
              ) : (
                playlistSongs.map((item) => (
                  <Card
                    key={item.id}
                    className="bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-all"
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="relative w-12 h-12 rounded overflow-hidden bg-muted flex-shrink-0">
                          {item.songs.image_url ? (
                            <img
                              src={item.songs.image_url}
                              alt={item.songs.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Music className="h-6 w-6 text-muted-foreground/50" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate">{item.songs.title}</h4>
                          <p className="text-xs text-muted-foreground">
                            {item.songs.genre} • {item.songs.mood}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => handlePlayPause(item.songs)}
                          >
                            {playingSongId === item.songs.id ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => removeSongFromPlaylist(item.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      <AlertDialog open={!!deletePlaylistId} onOpenChange={() => setDeletePlaylistId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Playlist</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this playlist? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePlaylistId && deletePlaylist(deletePlaylistId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
