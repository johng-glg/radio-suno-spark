import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Play, Pause, Music, Radio, Share2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAudioPlayer } from '@/contexts/AudioContext';
import { useToast } from '@/hooks/use-toast';

interface SharedSong {
  id: string;
  title: string;
  genre: string;
  mood: string | null;
  url: string | null;
  storage_path: string | null;
  image_url: string | null;
  holiday: string | null;
  description: string | null;
}

const GENRE_HUES: Record<string, [number, number]> = {
  classical: [36, 20], edm: [190, 280], pop: [320, 40], rock: [0, 25],
  jazz: [260, 30], 'hip-hop': [280, 200], country: [30, 90], brasscore: [45, 200],
};

function genreArt(genre: string): string {
  const [h1, h2] = GENRE_HUES[genre?.toLowerCase()] ?? [220, 300];
  return `conic-gradient(from 220deg at 40% 40%, hsl(${h1} 70% 45%), hsl(${h2} 65% 30%), hsl(${h1} 80% 15%), hsl(${h2} 70% 40%), hsl(${h1} 70% 45%))`;
}

/**
 * Public landing page for a shared song link (/song/:id). No sign-in needed:
 * it only loads public, ready, archived songs — the same ones the library shows.
 */
export default function SongPage() {
  const { id } = useParams<{ id: string }>();
  const [song, setSong] = useState<SharedSong | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const { currentSong, isPlaying, playSong, pause } = useAudioPlayer();
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('songs')
        .select('id, title, genre, mood, url, storage_path, image_url, holiday, description')
        .eq('id', id)
        .eq('is_public', true)
        .in('status', ['ready', 'completed'])
        .not('url', 'is', null)
        .not('storage_path', 'is', null)
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
      } else {
        setSong(data);
      }
      setLoading(false);
    };
    if (id) load();
  }, [id]);

  const isThisSong = currentSong?.id === song?.id;

  const handlePlay = () => {
    if (!song) return;
    if (isThisSong) {
      if (isPlaying) pause();
      else playSong({ ...song, mood: song.mood ?? undefined, image_url: song.image_url ?? undefined }, 'player');
      return;
    }
    playSong({
      id: song.id,
      title: song.title,
      url: song.url ?? undefined,
      storage_path: song.storage_path,
      genre: song.genre,
      mood: song.mood ?? undefined,
      image_url: song.image_url ?? undefined,
    }, 'player');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy", description: 'Copy the address from your browser bar instead.', variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md bg-card/50 backdrop-blur-sm border-border/50">
        <CardContent className="p-6 space-y-5">
          {loading ? (
            <>
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </>
          ) : notFound || !song ? (
            <div className="text-center py-8 space-y-4">
              <Music className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="text-muted-foreground">This song isn't available anymore.</p>
              <Button asChild variant="outline">
                <Link to="/">
                  <Radio className="h-4 w-4 mr-2" /> Tune in to Spark Radio
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <div
                className="relative aspect-square w-full rounded-lg overflow-hidden"
                style={song.image_url
                  ? { backgroundImage: `url(${song.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : { background: genreArt(song.genre) }}
              >
                {!song.image_url && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Music className="h-16 w-16 text-white/40" />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h1 className="text-xl font-bold leading-tight">{song.title}</h1>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="capitalize">{song.genre}</Badge>
                  {song.mood && <Badge variant="outline" className="capitalize">{song.mood}</Badge>}
                  {song.holiday && <Badge variant="outline" className="capitalize">{song.holiday}</Badge>}
                </div>
                {song.description && (
                  <p className="text-sm text-muted-foreground">{song.description}</p>
                )}
              </div>

              <div className="flex gap-2">
                <Button className="flex-1 neon-glow" size="lg" onClick={handlePlay}>
                  {isThisSong && isPlaying ? (
                    <><Pause className="h-5 w-5 mr-2" /> Pause</>
                  ) : (
                    <><Play className="h-5 w-5 mr-2 ml-0.5" /> Play</>
                  )}
                </Button>
                <Button variant="outline" size="lg" onClick={copyLink} title="Copy link">
                  {copied ? <Check className="h-5 w-5 text-primary" /> : <Share2 className="h-5 w-5" />}
                </Button>
              </div>

              <Button asChild variant="ghost" className="w-full">
                <Link to="/">
                  <Radio className="h-4 w-4 mr-2" /> Tune in to Spark Radio
                </Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
