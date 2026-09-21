import { Link, useLocation } from 'react-router-dom';
import { Play, Pause, SkipForward, Volume2, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useAudioPlayer } from '@/contexts/AudioContext';
import { useRadioOptional } from '@/hooks/useRadio';

const GENRE_HUES: Record<string, [number, number]> = {
  classical: [36, 20], edm: [190, 280], pop: [320, 40], rock: [0, 25],
  jazz: [260, 30], 'hip-hop': [280, 200], country: [30, 90],
};

function genreArt(genre: string): string {
  const [h1, h2] = GENRE_HUES[genre?.toLowerCase()] ?? [220, 300];
  return `conic-gradient(from 220deg at 40% 40%, hsl(${h1} 70% 45%), hsl(${h2} 65% 30%), hsl(${h1} 80% 15%), hsl(${h2} 70% 40%), hsl(${h1} 70% 45%))`;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * The one and only transport bar. Lives at the app root so a track keeps
 * playing — and stays controllable — on every page, station or library alike.
 */
export default function GlobalPlayer() {
  const { currentSong, isPlaying, progress, duration, volume, setVolume, seekTo, pause, resume } = useAudioPlayer();
  const radio = useRadioOptional();
  const status = radio?.status;
  const skip = radio?.skip;
  const location = useLocation();

  if (!currentSong) return null;

  const onAir = status === 'on-air';

  return (
    <>
      {/* keeps page content clear of the fixed bar */}
      <div className="h-24" aria-hidden />

      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border/50 bg-background/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-full border-2 border-border/60 shrink-0 overflow-hidden ${isPlaying ? 'vinyl-spin' : ''}`}
            style={currentSong.image_url
              ? { backgroundImage: `url(${currentSong.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : { background: genreArt(currentSong.genre ?? '') }}
          />

          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 min-w-0">
              <p className="font-semibold truncate text-sm">{currentSong.title ?? 'Untitled'}</p>
              {onAir && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary shrink-0">
                  <Radio className="h-3 w-3" /> on air
                </span>
              )}
            </div>
            <div
              className="progress-bar cursor-pointer h-1.5"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                seekTo(((e.clientX - rect.left) / rect.width) * 100);
              }}
            >
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{formatTime((progress / 100) * duration)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button size="icon" className="h-11 w-11 rounded-full neon-glow"
              onClick={() => (isPlaying ? pause() : resume())}
              title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
            </Button>
            {onAir && (
              <Button variant="ghost" size="icon" onClick={skip} title="Skip">
                <SkipForward className="h-5 w-5" />
              </Button>
            )}
            {location.pathname !== '/' && (
              <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                <Link to="/">Radio</Link>
              </Button>
            )}
          </div>

          <div className="hidden md:flex items-center gap-2 w-28 shrink-0">
            <Volume2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <Slider value={[volume]} onValueChange={(v) => setVolume(v[0])} max={100} step={1} className="w-20" />
          </div>
        </div>
      </div>
    </>
  );
}
