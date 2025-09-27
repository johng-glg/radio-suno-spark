import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Music, Radio, Sparkles } from "lucide-react";

const GENRES = [
  "Lo-fi", "Country", "EDM", "Jazz", "Ambient", "Rock", 
  "Hip-Hop", "Classical", "Folk", "Electronic"
];

const MOODS = [
  "upbeat", "chill", "dark", "dreamy", "epic", 
  "melancholic", "energetic", "peaceful"
];

interface LandingPageProps {
  onStartRadio: (genres: string[], mood?: string) => void;
}

export default function LandingPage({ onStartRadio }: LandingPageProps) {
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedMood, setSelectedMood] = useState<string>("");

  const toggleGenre = (genre: string) => {
    setSelectedGenres(prev => 
      prev.includes(genre) 
        ? prev.filter(g => g !== genre)
        : [...prev, genre]
    );
  };

  const handleStartRadio = () => {
    if (selectedGenres.length === 0) return;
    onStartRadio(selectedGenres, selectedMood || undefined);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 radio-gradient">
      <div className="w-full max-w-2xl space-y-8 animate-fade-in-up">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center space-x-3 mb-6">
            <div className="p-3 rounded-full bg-primary/20 neon-glow">
              <Radio className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-neon-purple to-neon-cyan bg-clip-text text-transparent">
              AI Radio
            </h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-lg mx-auto">
            Endless AI-generated music tailored to your taste. Select your genres and let the algorithm create your perfect radio station.
          </p>
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

            {/* Mood Selection */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Sparkles className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-semibold">Mood (Optional)</h3>
              </div>
              <Select value={selectedMood} onValueChange={setSelectedMood}>
                <SelectTrigger className="w-full bg-muted/30">
                  <SelectValue placeholder="Choose a mood..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No specific mood</SelectItem>
                  {MOODS.map((mood) => (
                    <SelectItem key={mood} value={mood}>
                      {mood.charAt(0).toUpperCase() + mood.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                Start Radio
              </Button>
              {selectedGenres.length === 0 && (
                <p className="text-sm text-muted-foreground text-center mt-2">
                  Select at least one genre to continue
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