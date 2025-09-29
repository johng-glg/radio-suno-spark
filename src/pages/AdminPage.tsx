import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAdmin } from '@/hooks/useAdmin';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Users, Music, AlertTriangle, TrendingUp, Settings, RefreshCw, Eye, Filter, Heart, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AdminStats {
  total_users: number;
  total_profiles: number;
  total_successful_songs: number;
  songs_by_genre: Record<string, number>;
  songs_by_status: Record<string, number>;
  failed_generations: number;
  user_list: Array<{
    id: string;
    email: string;
    display_name: string;
    created_at: string;
    last_sign_in_at: string | null;
    role: string;
  }>;
  recent_failed_songs: Array<{
    id: string;
    title: string;
    genre: string;
    created_at: string;
    prompt: string;
    status?: string;
    resubmitted_at?: string | null;
    resubmission_succeeded_at?: string | null;
  }>;
  recent_songs: Array<{
    id: string;
    title: string;
    genre: string;
    mood: string;
    created_at: string;
    status: string;
    url: string | null;
    image_url: string | null;
  }>;
  top_songs: Array<{
    id: string;
    title: string;
    genre: string;
    mood: string;
    created_at: string;
    likes_count: number;
    total_plays: number;
  }>;
}

export default function AdminPage() {
  const { isAdmin, loading, getAdminStats, makeUserAdmin, resubmitFailedSong, checkSongStatus } = useAdmin();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [resubmittingIds, setResubmittingIds] = useState<Set<string>>(new Set());
  const [promotingUserIds, setPromotingUserIds] = useState<Set<string>>(new Set());
  const [checkingStatusIds, setCheckingStatusIds] = useState<Set<string>>(new Set());
  const [hideSuccessfulResubmissions, setHideSuccessfulResubmissions] = useState(true);
  const [topSongsGenreFilter, setTopSongsGenreFilter] = useState<string>('all');
  const [topSongsMoodFilter, setTopSongsMoodFilter] = useState<string>('all');
  const [topSongsSortBy, setTopSongsSortBy] = useState<'likes' | 'plays'>('likes');

  useEffect(() => {
    if (isAdmin) {
      loadStats();

      // Set up real-time subscription for song status changes
      const channel = supabase
        .channel('song_status_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'songs'
          },
          (payload) => {
            console.log('Song status changed:', payload);
            // Reload stats when any song changes
            loadStats();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [isAdmin]);

  const loadStats = async () => {
    setStatsLoading(true);
    const data = await getAdminStats();
    setStats(data as unknown as AdminStats);
    setStatsLoading(false);
  };

  const handleMakeAdmin = async (userId: string, userName: string) => {
    setPromotingUserIds(prev => new Set([...prev, userId]));

    try {
      const { error } = await makeUserAdmin(userId);
      if (error) {
        toast({
          title: "Error",
          description: error.message || "Failed to make user admin",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Success",
          description: `${userName} has been made admin successfully`
        });
        // Reload stats to update the user list
        loadStats();
      }
    } finally {
      setPromotingUserIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    }
  };

  const handleResubmitSong = async (songId: string, songTitle: string) => {
    setResubmittingIds(prev => new Set([...prev, songId]));
    
    try {
      const { error, newSongId } = await resubmitFailedSong(songId);
      if (error) {
        toast({
          title: "Error",
          description: error.message || "Failed to resubmit song",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Success",
          description: `"${songTitle}" has been resubmitted for generation${newSongId ? ` (New ID: ${newSongId.slice(0, 8)}...)` : ''}`,
          variant: "default"
        });
        
        // Optimistically update UI to show Processing state on the original failed record
        setStats(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            recent_failed_songs: prev.recent_failed_songs?.map(s =>
              s.id === songId ? { ...s, resubmitted_at: new Date().toISOString() } : s
            )
          };
        });
        
        console.log('Resubmit successful, reloading stats...');
        // Force reload stats to update the failed songs list
        await loadStats();
      }
    } finally {
      setResubmittingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(songId);
        return newSet;
      });
    }
  };

  const handleCheckStatus = async (songId: string, songTitle: string) => {
    setCheckingStatusIds(prev => new Set([...prev, songId]));
    
    try {
      const { data, error } = await checkSongStatus(songId);
      if (error) {
        toast({
          title: "Error",
          description: error.message || "Failed to check song status",
          variant: "destructive"
        });
      } else {
        const statusInfo = [
          `ID: ${data?.id?.slice(0, 8)}...`,
          `Status: ${data?.status}`,
          `Updated: ${data?.updated_at ? new Date(data.updated_at).toLocaleString() : 'Never'}`,
          data?.resubmitted_at ? `Resubmitted: ${new Date(data.resubmitted_at).toLocaleString()}` : null,
          data?.resubmission_succeeded_at ? `Succeeded: ${new Date(data.resubmission_succeeded_at).toLocaleString()}` : null,
          data?.original_song_id ? `Original: ${data.original_song_id.slice(0, 8)}...` : null
        ].filter(Boolean).join('\n');

        toast({
          title: `Status: "${songTitle || 'Untitled'}"`,
          description: statusInfo,
          variant: "default"
        });

        // Reload stats to update the UI with current status
        loadStats();
      }
    } finally {
      setCheckingStatusIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(songId);
        return newSet;
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Checking admin access...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const totalSongs = stats?.total_successful_songs || 0;
  const failureRate = (stats?.total_successful_songs || 0) + (stats?.failed_generations || 0) > 0 
    ? ((stats?.failed_generations || 0) / ((stats?.total_successful_songs || 0) + (stats?.failed_generations || 0)) * 100).toFixed(1) 
    : '0';

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Admin Dashboard</h1>
              <p className="text-muted-foreground">Manage your music generation platform</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadStats}
                disabled={statsLoading}
                className="flex items-center gap-2"
                title="Refresh statistics"
              >
                <RefreshCw className={`h-4 w-4 ${statsLoading ? 'animate-spin' : ''}`} />
                Refresh Stats
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/')}
                className="h-10 w-10"
                title="Close admin panel"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="users">User Management</TabsTrigger>
            <TabsTrigger value="failed-songs">Failed Generations</TabsTrigger>
            <TabsTrigger value="recent-songs">Recent Songs</TabsTrigger>
            <TabsTrigger value="top-songs">Top Songs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {statsLoading ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <div className="animate-pulse">
                        <div className="h-4 bg-muted rounded w-1/2 mb-2"></div>
                        <div className="h-8 bg-muted rounded w-3/4"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-2">
                        <Users className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium text-muted-foreground">Total Users</p>
                      </div>
                      <p className="text-2xl font-bold">{stats?.total_users || 0}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-2">
                        <Music className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium text-muted-foreground">Total Songs</p>
                      </div>
                      <p className="text-2xl font-bold">{totalSongs}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-2">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        <p className="text-sm font-medium text-muted-foreground">Failed Generations</p>
                      </div>
                      <p className="text-2xl font-bold">{stats?.failed_generations || 0}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium text-muted-foreground">Failure Rate</p>
                      </div>
                      <p className="text-2xl font-bold">{failureRate}%</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Songs by Genre</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {stats?.songs_by_genre && Object.entries(stats.songs_by_genre).map(([genre, count]) => (
                          <div key={genre} className="flex items-center justify-between">
                            <span className="capitalize text-sm">{genre}</span>
                            <Badge variant="secondary">{count}</Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Songs by Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {stats?.songs_by_status && Object.entries(stats.songs_by_status).map(([status, count]) => (
                          <div key={status} className="flex items-center justify-between">
                            <span className="capitalize text-sm">{status}</span>
                            <Badge variant={status === 'failed' ? 'destructive' : 'secondary'}>
                              {count}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>
                  View all users and manage admin privileges
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stats?.user_list && stats.user_list.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Last Login</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.user_list.map((user) => {
                        const isPromoting = promotingUserIds.has(user.id);
                        const isCurrentAdmin = user.role === 'admin';
                        
                        return (
                          <TableRow key={user.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{user.display_name}</p>
                                <p className="text-sm text-muted-foreground">{user.email}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={isCurrentAdmin ? "default" : "secondary"}>
                                {user.role}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {user.last_sign_in_at 
                                ? new Date(user.last_sign_in_at).toLocaleDateString()
                                : 'Never'
                              }
                            </TableCell>
                            <TableCell>
                              {new Date(user.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              {isCurrentAdmin ? (
                                <Badge variant="outline">Already Admin</Badge>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleMakeAdmin(user.id, user.display_name)}
                                  disabled={isPromoting}
                                >
                                  <Settings className={`h-4 w-4 mr-2 ${isPromoting ? 'animate-spin' : ''}`} />
                                  {isPromoting ? 'Promoting...' : 'Make Admin'}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No users found
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="failed-songs" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Recent Failed Generations</CardTitle>
                    <CardDescription>
                      Latest songs that failed to generate
                    </CardDescription>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="show-successful" className="text-sm text-muted-foreground">
                      Show successful resubmissions
                    </Label>
                    <Switch
                      id="show-successful"
                      checked={!hideSuccessfulResubmissions}
                      onCheckedChange={(checked) => setHideSuccessfulResubmissions(!checked)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {(() => {
                  const filteredSongs = stats?.recent_failed_songs?.filter(song => 
                    hideSuccessfulResubmissions ? !song.resubmission_succeeded_at : true
                  ) || [];
                  
                  // Sort by priority: successful resubmissions first, then processing, then failed
                  const sortedSongs = filteredSongs.sort((a, b) => {
                    const aSucceeded = !!a.resubmission_succeeded_at;
                    const aProcessing = !!a.resubmitted_at && !a.resubmission_succeeded_at;
                    const bSucceeded = !!b.resubmission_succeeded_at;
                    const bProcessing = !!b.resubmitted_at && !b.resubmission_succeeded_at;
                    
                    // Priority: successful (3) > processing (2) > failed (1)
                    const aPriority = aSucceeded ? 3 : aProcessing ? 2 : 1;
                    const bPriority = bSucceeded ? 3 : bProcessing ? 2 : 1;
                    
                    return bPriority - aPriority;
                  });
                  
                  return sortedSongs.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Genre</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Prompt</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedSongs.map((song) => {
                          const isResubmitted = song.resubmitted_at && !song.resubmission_succeeded_at;
                          const isResubmissionSucceeded = song.resubmission_succeeded_at;
                          const isResubmitting = resubmittingIds.has(song.id);
                          const isCheckingStatus = checkingStatusIds.has(song.id);
                          
                          return (
                            <TableRow key={song.id}>
                              <TableCell>{song.title || 'Untitled'}</TableCell>
                              <TableCell className="capitalize">{song.genre}</TableCell>
                              <TableCell>
                                {new Date(song.created_at).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="max-w-xs truncate" title={song.prompt}>
                                {song.prompt}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleCheckStatus(song.id, song.title || 'Untitled')}
                                    disabled={isCheckingStatus}
                                    title="Check current status"
                                  >
                                    <Eye className={`h-4 w-4 ${isCheckingStatus ? 'animate-pulse' : ''}`} />
                                  </Button>
                                  {isResubmissionSucceeded ? (
                                    <Badge variant="default" className="bg-green-600">
                                      ✓ Succeeded
                                    </Badge>
                                  ) : isResubmitted ? (
                                    <Button
                                      size="sm"
                                      variant="default"
                                      disabled={true}
                                      className="bg-yellow-500 hover:bg-yellow-600 cursor-not-allowed"
                                    >
                                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                      Processing...
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant={isResubmitting ? "default" : "outline"}
                                      onClick={() => handleResubmitSong(song.id, song.title || 'Untitled')}
                                      disabled={isResubmitting}
                                      className={isResubmitting ? "bg-green-600 hover:bg-green-700" : ""}
                                    >
                                      <RefreshCw className={`h-4 w-4 mr-2 ${isResubmitting ? 'animate-spin' : ''}`} />
                                      {isResubmitting ? 'Resubmitting...' : 'Resubmit'}
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                   ) : (
                     <p className="text-center text-muted-foreground py-8">
                       {hideSuccessfulResubmissions && stats?.recent_failed_songs?.length > 0 
                         ? "All failed generations have been successfully resubmitted" 
                         : "No failed generations found"
                       }
                     </p>
                   );
                 })()}
               </CardContent>
             </Card>
            </TabsContent>

            <TabsContent value="recent-songs" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Songs</CardTitle>
                  <CardDescription>
                    10 most recently generated songs
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {stats?.recent_songs && stats.recent_songs.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Genre</TableHead>
                          <TableHead>Mood</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.recent_songs.map((song) => (
                          <TableRow key={song.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                {song.image_url && (
                                  <img 
                                    src={song.image_url} 
                                    alt={song.title || 'Song cover'} 
                                    className="w-10 h-10 rounded object-cover"
                                  />
                                )}
                                <div>
                                  <p className="font-medium">{song.title || 'Untitled'}</p>
                                  <p className="text-xs text-muted-foreground">{song.id.slice(0, 8)}...</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="capitalize">
                                {song.genre}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {song.mood || 'N/A'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={song.status === 'completed' ? 'default' : song.status === 'generating' ? 'secondary' : 'destructive'}>
                                {song.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {new Date(song.created_at).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      No recent songs found
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

             <TabsContent value="top-songs" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Heart className="h-5 w-5 text-primary" />
                        Top 10 Songs
                      </CardTitle>
                      <CardDescription>
                        Most popular songs by likes and plays
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="sort-filter" className="text-sm text-muted-foreground">
                          Sort by:
                        </Label>
                        <Select value={topSongsSortBy} onValueChange={(value: 'likes' | 'plays') => setTopSongsSortBy(value)}>
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="likes">Likes</SelectItem>
                            <SelectItem value="plays">Plays</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="genre-filter" className="text-sm text-muted-foreground">
                          Filter by genre:
                        </Label>
                        <Select value={topSongsGenreFilter} onValueChange={setTopSongsGenreFilter}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select genre" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Genres</SelectItem>
                            {stats?.songs_by_genre && Object.keys(stats.songs_by_genre).map((genre) => (
                              <SelectItem key={genre} value={genre} className="capitalize">
                                {genre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="mood-filter" className="text-sm text-muted-foreground">
                          Filter by mood:
                        </Label>
                        <Select value={topSongsMoodFilter} onValueChange={setTopSongsMoodFilter}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select mood" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Moods</SelectItem>
                            {["Upbeat", "Chill", "Aggressive", "Emotional", "Epic", "Playful"].map((mood) => (
                              <SelectItem key={mood} value={mood.toLowerCase()} className="capitalize">
                                {mood}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {(() => {
                     let filteredSongs = stats?.top_songs?.filter(song => 
                       (topSongsGenreFilter === 'all' || song.genre === topSongsGenreFilter) &&
                       (topSongsMoodFilter === 'all' || song.mood === topSongsMoodFilter)
                     ) || [];
                    
                    // Sort by the selected metric
                    filteredSongs = filteredSongs
                      .sort((a, b) => {
                        const valueA = topSongsSortBy === 'likes' ? a.likes_count : a.total_plays;
                        const valueB = topSongsSortBy === 'likes' ? b.likes_count : b.total_plays;
                        return valueB - valueA;
                      })
                      .slice(0, 10); // Limit to top 10
                    
                    return filteredSongs.length > 0 ? (
                    <Table>
                       <TableHeader>
                         <TableRow>
                           <TableHead>Rank</TableHead>
                           <TableHead>Song</TableHead>
                           <TableHead>Genre</TableHead>
                           <TableHead>Mood</TableHead>
                           <TableHead>Likes</TableHead>
                           <TableHead>Plays</TableHead>
                           <TableHead>Created</TableHead>
                         </TableRow>
                       </TableHeader>
                      <TableBody>
                        {filteredSongs.map((song, index) => (
                          <TableRow key={song.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                  index === 0 ? 'bg-yellow-100 text-yellow-800' :
                                  index === 1 ? 'bg-gray-100 text-gray-800' :
                                  index === 2 ? 'bg-orange-100 text-orange-800' :
                                  'bg-muted text-muted-foreground'
                                }`}>
                                  {index + 1}
                                </div>
                                {index < 3 && (
                                  <div className="text-lg">
                                    {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{song.title || 'Untitled'}</p>
                                <p className="text-xs text-muted-foreground">{song.id.slice(0, 8)}...</p>
                              </div>
                            </TableCell>
                             <TableCell>
                               <Badge variant="secondary" className="capitalize">
                                 {song.genre}
                               </Badge>
                             </TableCell>
                             <TableCell>
                               <Badge variant="outline" className="capitalize">
                                 {song.mood || 'N/A'}
                               </Badge>
                             </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Heart className="h-4 w-4 text-red-500 fill-red-500" />
                                <span className="font-semibold">{song.likes_count}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Music className="h-4 w-4 text-green-500" />
                                <span className="font-semibold">{song.total_plays}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {new Date(song.created_at).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    ) : (
                       <p className="text-center text-muted-foreground py-8">
                         {(() => {
                           const genreFilter = topSongsGenreFilter === 'all' ? null : topSongsGenreFilter;
                           const moodFilter = topSongsMoodFilter === 'all' ? null : topSongsMoodFilter;
                           
                           if (!genreFilter && !moodFilter) {
                             return 'No songs found';
                           } else if (genreFilter && moodFilter) {
                             return `No songs found for ${genreFilter} genre with ${moodFilter} mood`;
                           } else if (genreFilter) {
                             return `No songs found for ${genreFilter} genre`;
                           } else {
                             return `No songs found for ${moodFilter} mood`;
                           }
                         })()}
                       </p>
                    );
                  })()}
                </CardContent>
               </Card>
             </TabsContent>
         </Tabs>
       </div>
     </div>
   );
 }