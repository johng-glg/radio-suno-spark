import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Music, Radio, Sparkles, LogIn, LogOut, User, Volume2 } from "lucide-react";
import { User as AuthUser } from '@supabase/supabase-js';
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const GENRES = [
  "Lo-fi", "Country", "EDM", "Jazz", "Ambient", "Rock", 
  "Hip-Hop", "Classical", "Folk", "Electronic"
];

const MOODS = [
  "upbeat", "chill", "dark", "dreamy", "epic", 
  "melancholic", "energetic", "peaceful"
];

interface LandingPageProps {
  onStartRadio: (genres: string[], mood?: string, instrumental?: boolean, wildcard?: boolean) => void;
  onAuthNavigate: () => void;
  user: AuthUser | null;
}

export default function LandingPage({ onStartRadio, onAuthNavigate, user }: LandingPageProps) {
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedMood, setSelectedMood] = useState<string>("");
  const [instrumentalMode, setInstrumentalMode] = useState<boolean>(false);
  const [wildcardMode, setWildcardMode] = useState<boolean>(false);
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
    if (selectedGenres.length === 0) return;
    const mood = selectedMood === "none" ? undefined : selectedMood;
    onStartRadio(selectedGenres, mood, instrumentalMode, wildcardMode);
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
    <div className="min-h-screen flex items-center justify-center p-4 radio-gradient">
      <div className="w-full max-w-2xl space-y-8 animate-fade-in-up">
        {/* Header with Auth */}
        <div className="relative">
          {/* User Email - positioned absolutely on the left */}
          {user && (
            <div className="absolute top-0 left-0 flex items-center space-x-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">{user.email}</span>
            </div>
          )}
          
          {/* Auth Button - positioned absolutely on the right */}
          <div className="absolute top-0 right-0 flex items-center space-x-2">
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
          
          {/* Centered content */}
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
        </div>

        {/* Main Card */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-8 space-y-8">
            {/* Genre Selection */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Music className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Choose Your Genres</h3>
                <Badge variant="secondary" className="text-xs">
                  {selectedGenres.length} selected
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
            </div>

            {/* Audio Style & Options */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Column - Mood Selection */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="h-4 w-4 text-accent" />
                    <span className="font-medium text-sm">Mood</span>
                  </div>
                  <Select value={selectedMood} onValueChange={setSelectedMood}>
                    <SelectTrigger className="w-full bg-muted/30">
                      <SelectValue placeholder="Choose mood..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border border-border z-50">
                      <SelectItem value="none">No specific mood</SelectItem>
                      {MOODS.map((mood) => (
                        <SelectItem key={mood} value={mood}>
                          {mood.charAt(0).toUpperCase() + mood.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Right Column - Audio Options */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Music className="h-4 w-4 text-accent" />
                    <span className="font-medium text-sm">Style Options</span>
                  </div>
                  
                  {/* Instrumental Toggle */}
                  <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                    <Label htmlFor="instrumental-mode" className="cursor-pointer">
                      <span className="text-sm font-medium">Instrumental</span>
                    </Label>
                    <Switch
                      id="instrumental-mode"
                      checked={instrumentalMode}
                      onCheckedChange={setInstrumentalMode}
                    />
                  </div>

                  {/* Wildcard Toggle */}
                  <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                    <Label htmlFor="wildcard-mode" className="cursor-pointer">
                      <span className="text-sm font-medium">Wild Card</span>
                    </Label>
                    <Switch
                      id="wildcard-mode"
                      checked={wildcardMode}
                      onCheckedChange={setWildcardMode}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Start Button */}
            <div className="pt-4">
              <Button 
                onClick={handleStartRadio}
                disabled={selectedGenres.length === 0}
                className="w-full h-14 text-lg font-semibold neon-glow disabled:opacity-50 disabled:cursor-not-allowed"
                size="lg"
              >
                <Play className="h-6 w-6 mr-3" />
                {user ? "Start Radio" : "Sign In to Start Radio"}
              </Button>
              {selectedGenres.length === 0 && (
                <p className="text-sm text-muted-foreground text-center mt-2">
                  Select at least one genre to continue
                </p>
              )}
              {!user && selectedGenres.length > 0 && (
                <p className="text-sm text-accent text-center mt-2">
                  Sign in to save your preferences and start listening
                </p>
              )}
            </div>
          </CardContent>
        </Card>

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