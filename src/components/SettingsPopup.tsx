import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Volume2, Zap } from "lucide-react";

interface SettingsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  currentGenres: string[];
  currentMood?: string;
  instrumentalMode: boolean;
  wildcardMode: boolean;
  generateWhenExhausted: boolean;
  holiday?: string;
  onSaveSettings: (settings: {
    genres: string[];
    mood?: string;
    instrumentalMode: boolean;
    wildcardMode: boolean;
    generateWhenExhausted: boolean;
    holiday?: string;
  }) => void;
}

const AVAILABLE_GENRES = [
  "classical", "edm", "pop", "rock", "jazz", "hip-hop", "country"
];

const AVAILABLE_MOODS = [
  "upbeat", "chill", "aggressive", "emotional", "epic", "playful"
];

const AVAILABLE_HOLIDAYS = [
  "christmas", "halloween", "hanukkah", "thanksgiving", "st. patty's day", "4th of july"
];

export default function SettingsPopup({
  isOpen,
  onClose,
  currentGenres,
  currentMood,
  instrumentalMode,
  wildcardMode,
  generateWhenExhausted,
  holiday,
  onSaveSettings,
}: SettingsPopupProps) {
  const [selectedGenres, setSelectedGenres] = useState<string[]>(currentGenres);
  const [selectedMood, setSelectedMood] = useState<string | undefined>(currentMood);
  const [tempInstrumentalMode, setTempInstrumentalMode] = useState(instrumentalMode);
  const [tempWildcardMode, setTempWildcardMode] = useState(wildcardMode);
  const [tempGenerateWhenExhausted, setTempGenerateWhenExhausted] = useState(generateWhenExhausted);
  const [selectedHoliday, setSelectedHoliday] = useState<string | undefined>(holiday);

  const handleGenreToggle = (genre: string) => {
    setSelectedGenres(prev => 
      prev.includes(genre) 
        ? prev.filter(g => g !== genre)
        : [...prev, genre]
    );
  };

  const handleSave = () => {
    onSaveSettings({
      genres: selectedGenres,
      mood: selectedMood,
      instrumentalMode: tempInstrumentalMode,
      wildcardMode: tempWildcardMode,
      generateWhenExhausted: tempGenerateWhenExhausted,
      holiday: selectedHoliday,
    });
    onClose();
  };

  const handleCancel = () => {
    // Reset to current values
    setSelectedGenres(currentGenres);
    setSelectedMood(currentMood);
    setTempInstrumentalMode(instrumentalMode);
    setTempWildcardMode(wildcardMode);
    setTempGenerateWhenExhausted(generateWhenExhausted);
    setSelectedHoliday(holiday);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md border-border z-50">
        <DialogHeader>
          <DialogTitle>Music Settings</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Genre Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Genres</Label>
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_GENRES.map((genre) => (
                <div key={genre} className="flex items-center space-x-2">
                  <Checkbox
                    id={`genre-${genre}`}
                    checked={selectedGenres.includes(genre)}
                    onCheckedChange={() => handleGenreToggle(genre)}
                  />
                  <Label 
                    htmlFor={`genre-${genre}`}
                    className="text-sm cursor-pointer"
                  >
                    {genre}
                  </Label>
                </div>
              ))}
            </div>
            {selectedGenres.length === 0 && (
              <p className="text-xs text-muted-foreground">No genres selected - will use all available genres</p>
            )}
          </div>

          {/* Mood Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Mood</Label>
            <Select value={selectedMood || "none"} onValueChange={(value) => setSelectedMood(value === "none" ? undefined : value)}>
              <SelectTrigger className="border-border">
                <SelectValue placeholder="Select mood (optional)" />
              </SelectTrigger>
              <SelectContent className="border-border">
                <SelectItem value="none">Any Mood</SelectItem>
                {AVAILABLE_MOODS.map((mood) => (
                  <SelectItem key={mood} value={mood}>
                    {mood}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Holiday Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Holiday Theme (Advanced)</Label>
            <Select value={selectedHoliday || "none"} onValueChange={(value) => setSelectedHoliday(value === "none" ? undefined : value)}>
              <SelectTrigger className="border-border">
                <SelectValue placeholder="No holiday (optional)" />
              </SelectTrigger>
              <SelectContent className="border-border">
                <SelectItem value="none">No Holiday</SelectItem>
                {AVAILABLE_HOLIDAYS.map((holiday) => (
                  <SelectItem key={holiday} value={holiday}>
                    {holiday}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Applies to generated songs only</p>
          </div>

          {/* Options */}
          <div className="space-y-4">
            {/* Instrumental Mode */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Instrumental Mode</Label>
              </div>
              <Switch
                checked={tempInstrumentalMode}
                onCheckedChange={setTempInstrumentalMode}
              />
            </div>

            {/* Wild Card Mode */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Wild Card Mode</Label>
              </div>
              <Switch
                checked={tempWildcardMode}
                onCheckedChange={setTempWildcardMode}
              />
            </div>

            {/* Auto-Generate New Songs */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Generate fresh music automatically</Label>
              </div>
              <Switch
                checked={tempGenerateWhenExhausted}
                onCheckedChange={setTempGenerateWhenExhausted}
              />
            </div>
          </div>

          {/* Current Selection Preview */}
          <div className="space-y-2 p-3 bg-muted/20 rounded-lg">
            <Label className="text-xs text-muted-foreground">Current Selection:</Label>
            <div className="flex flex-wrap gap-1">
              {selectedGenres.length === 0 ? (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  All Genres (default)
                </Badge>
              ) : (
                selectedGenres.map(genre => (
                  <Badge key={genre} variant="secondary" className="text-xs">
                    {genre}
                  </Badge>
                ))
              )}
              {selectedMood && (
                <Badge variant="outline" className="text-xs">
                  {selectedMood}
                </Badge>
              )}
              {selectedHoliday && (
                <Badge variant="outline" className="text-xs text-purple-400 border-purple-400/50">
                  🎉 {selectedHoliday}
                </Badge>
              )}
              {tempInstrumentalMode && (
                <Badge variant="outline" className="text-xs text-blue-400 border-blue-400/50">
                  <Volume2 className="h-3 w-3 mr-1" />
                  Instrumental
                </Badge>
              )}
              {tempWildcardMode && (
                <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-400/50">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Wild Card
                </Badge>
              )}
              {tempGenerateWhenExhausted && (
                <Badge variant="outline" className="text-xs text-green-400 border-green-400/50">
                  <Zap className="h-3 w-3 mr-1" />
                  Auto-Generate
                </Badge>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
          >
            Apply Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}