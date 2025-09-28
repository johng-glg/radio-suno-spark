import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAdmin } from '@/hooks/useAdmin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Users, Music, AlertTriangle, TrendingUp, Settings, RefreshCw, Eye } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
}

export default function AdminPage() {
  const { isAdmin, loading, getAdminStats, makeUserAdmin, resubmitFailedSong, checkSongStatus } = useAdmin();
  const { toast } = useToast();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [resubmittingIds, setResubmittingIds] = useState<Set<string>>(new Set());
  const [promotingUserIds, setPromotingUserIds] = useState<Set<string>>(new Set());
  const [checkingStatusIds, setCheckingStatusIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isAdmin) {
      loadStats();
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
        // Reload stats to update the failed songs list
        loadStats();
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
          <h1 className="text-3xl font-bold text-foreground mb-2">Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage your music generation platform</p>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="users">User Management</TabsTrigger>
            <TabsTrigger value="failed-songs">Failed Generations</TabsTrigger>
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
                <CardTitle>Recent Failed Generations</CardTitle>
                <CardDescription>
                  Latest songs that failed to generate
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stats?.recent_failed_songs && stats.recent_failed_songs.length > 0 ? (
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
                      {stats.recent_failed_songs.map((song) => {
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
                    No failed generations found
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}