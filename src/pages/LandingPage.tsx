import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Music, Radio, Sparkles, LogIn, LogOut, User, Zap, Volume2, Snowflake, Ghost, Star, Leaf, Clover, Flag, Library, ListMusic } from "lucide-react";
import { User as AuthUser } from '@supabase/supabase-js';
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import SongBrowser from "@/components/SongBrowser";
import PlaylistsView from "@/components/PlaylistsView";
import UnifiedPlayer from "@/components/UnifiedPlayer";

const GENRES = [
  "Classical", "EDM", "Pop", "Rock", "Jazz", "Hip-Hop", "Country"
];

const MOODS = [
  "Upbeat", "Chill", "Aggressive", "Emotional", "Epic", "Playful"
];

const HOLIDAYS = [
  { name: "Christmas", icon: Snowflake, emoji: null },
  { name: "Halloween", icon: Ghost, emoji: null },
  { name: "Hanukkah", icon: null, emoji: "🕎" },
  { name: "Thanksgiving", icon: null, emoji: "🍗" },
  { name: "St. Patty's Day", icon: Clover, emoji: null },
  { name: "4th of July", icon: Flag, emoji: null },
];

interface LandingPageProps {
  onStartRadio: (genres: string[], mood?: string, instrumental?: boolean, wildcard?: boolean, holiday?: string) => void;
  onAuthNavigate: () => void;
  user: AuthUser | null;
}

export default function LandingPage({ onStartRadio, onAuthNavigate, user }: LandingPageProps) {
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [isInstrumental, setIsInstrumental] = useState(false);
  const [isWildcard, setIsWildcard] = useState(false);
  const [selectedHoliday, setSelectedHoliday] = useState<string | undefined>(undefined);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { signOut } = useAuth();
  const { toast } = useToast();

  const toggleGenre = (genre: string) => {
    setSelectedGenres(prev => 
      prev.includes(genre) 
        ? prev.filter(g => g !== genre)
        : [...prev, genre]
    );
  };

  const handleStartRadio = () => {
    onStartRadio(selectedGenres, selectedMood || undefined, isInstrumental, isWildcard, selectedHoliday);
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
      toast({
        title: "Signed out",
        description: "You have been successfully signed out.",
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 radio-gradient">
      {/* Auth Header - fixed at top */}
      <div className="fixed top-0 left-0 right-0 z-10 p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          {/* User Email - positioned on the left */}
          {user && (
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">{user.email}</span>
            </div>
          )}
          
          {/* Empty div for spacing when no user */}
          {!user && <div></div>}
          
          {/* Auth Button - positioned on the right */}
          <div className="flex items-center space-x-2">
            {user ? (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleSignOut}
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            ) : (
              <Button 
                variant="outline" 
                size="sm"
                onClick={onAuthNavigate}
                className="neon-glow"
              >
                <LogIn className="h-4 w-4 mr-2" />
                Sign In
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full max-w-6xl space-y-8 animate-fade-in-up mt-16">
        {/* AI Radio Title */}
        <div className="text-center">
          <div className="flex items-center justify-center space-x-3 mb-6">
            <div className="p-3 rounded-full bg-primary/20 neon-glow">
              <Radio className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-neon-purple to-neon-cyan bg-clip-text text-transparent">
              AI Radio
            </h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-lg mx-auto text-center">
            Endless AI-generated music tailored to your taste. Select your genres and let the algorithm create your perfect radio station.
          </p>
        </div>

        {/* Unified Player */}
        <UnifiedPlayer />

        {/* Tabs for Radio vs Browser vs Playlists */}
        <Tabs defaultValue="radio" className="w-full">
          <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-3 mb-8">
            <TabsTrigger value="radio" className="flex items-center gap-2">
              <Radio className="h-4 w-4" />
              Create Station
            </TabsTrigger>
            <TabsTrigger value="browser" className="flex items-center gap-2">
              <Library className="h-4 w-4" />
              Browse Songs
            </TabsTrigger>
            <TabsTrigger value="playlists" className="flex items-center gap-2">
              <ListMusic className="h-4 w-4" />
              Playlists
            </TabsTrigger>
          </TabsList>

          {/* Create Radio Tab */}
          <TabsContent value="radio">
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardContent className="p-8 space-y-8">
                {/* Genre Selection */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Music className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">Choose Your Genres</h3>
                    <Badge variant="secondary" className="text-xs">
                      {selectedGenres.length === 0 ? 'optional' : `${selectedGenres.length} selected`}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {GENRES.map((genre) => (
                      <button
                        key={genre}
                        onClick={() => toggleGenre(genre)}
                        className={`genre-chip ${selectedGenres.includes(genre) ? 'selected' : ''}`}
                      >
                        {genre}
                      </button>
                    ))}
                  </div>
                  {selectedGenres.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No genres selected - will use all available genres
                    </p>
                  )}
                </div>

                {/* Mood Selection */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="h-5 w-5 text-accent" />
                    <h3 className="text-lg font-semibold">Select a Mood</h3>
                    <Badge variant="secondary" className="text-xs">
                      {selectedMood ? 'selected' : 'optional'}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {MOODS.map((mood) => (
                      <button
                        key={mood}
                        onClick={() => setSelectedMood(mood === selectedMood ? null : mood)}
                        className={`genre-chip ${selectedMood === mood ? 'selected' : ''}`}
                      >
                        {mood}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Advanced Options */}
                <div className="space-y-4">
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center space-x-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span>{showAdvanced ? '▼' : '▶'}</span>
                    <span className="font-medium">Advanced Options</span>
                  </button>
                  
                  {showAdvanced && (
                    <div className="space-y-4 animate-fade-in-up">
                      {/* Instrumental Toggle */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Volume2 className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Instrumental</p>
                            <p className="text-sm text-muted-foreground">Generate music without vocals</p>
                          </div>
                        </div>
                        <Switch
                          checked={isInstrumental}
                          onCheckedChange={setIsInstrumental}
                        />
                      </div>

                      {/* Wildcard Toggle */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Zap className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Wildcard Mode</p>
                            <p className="text-sm text-muted-foreground">Add unexpected creative twists</p>
                          </div>
                        </div>
                        <Switch
                          checked={isWildcard}
                          onCheckedChange={setIsWildcard}
                        />
                      </div>

                      {/* Holiday Theme */}
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <Sparkles className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Holiday Theme</p>
                            <p className="text-sm text-muted-foreground">Add festive vibes to generated music</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {HOLIDAYS.map((holiday) => {
                            const Icon = holiday.icon;
                            return (
                              <button
                                key={holiday.name}
                                onClick={() => setSelectedHoliday(selectedHoliday === holiday.name ? undefined : holiday.name)}
                                className={`flex flex-col items-center justify-center p-2 rounded-lg border-2 transition-all ${
                                  selectedHoliday === holiday.name
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border bg-background/50 hover:border-primary/50 hover:bg-background/80'
                                }`}
                              >
                                {Icon ? (
                                  <Icon className="h-5 w-5 mb-1" />
                                ) : (
                                  <span className="text-2xl mb-1">{holiday.emoji}</span>
                                )}
                                <span className="text-[10px] font-medium text-center leading-tight">{holiday.name}</span>
                              </button>
                            );
                          })}
                        </div>
                        {selectedHoliday && (
                          <p className="text-xs text-muted-foreground">
                            🎉 {selectedHoliday} theme will be applied to generated songs
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Start Button */}
                <div className="pt-4">
                  <Button 
                    onClick={handleStartRadio}
                    className="w-full h-14 text-lg font-semibold neon-glow"
                    size="lg"
                  >
                    <Play className="h-6 w-6 mr-3" />
                    {user ? "Start Station" : "Sign In to Start Station"}
                  </Button>
                  {!user && (
                    <p className="text-sm text-accent text-center mt-2">
                      Sign in to save your preferences and start listening
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Browse Songs Tab */}
          <TabsContent value="browser">
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardContent className="p-8">
                <SongBrowser />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Playlists Tab */}
          <TabsContent value="playlists">
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardContent className="p-8">
                <PlaylistsView />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Feature highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center text-sm text-muted-foreground">
          <div className="space-y-2">
            <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center mx-auto">
              <Music className="h-4 w-4 text-primary" />
            </div>
            <p>AI-Generated Music</p>
          </div>
          <div className="space-y-2">
            <div className="w-8 h-8 bg-accent/20 rounded-full flex items-center justify-center mx-auto">
              <Radio className="h-4 w-4 text-accent" />
            </div>
            <p>Continuous Playback</p>
          </div>
          <div className="space-y-2">
            <div className="w-8 h-8 bg-neon-pink/20 rounded-full flex items-center justify-center mx-auto">
              <Sparkles className="h-4 w-4 text-neon-pink" />
            </div>
            <p>Personalized Experience</p>
          </div>
        </div>
      </div>
    </div>
  );
}