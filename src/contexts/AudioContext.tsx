import { createContext, useContext, useRef, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Song {
  id: string;
  title: string;
  url?: string;
  genre: string;
  mood?: string;
  image_url?: string;
}

interface AudioContextType {
  currentSong: Song | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  playSong: (song: Song, context?: 'player' | 'playlist') => void;
  pause: () => void;
  resume: () => void;
  setVolume: (volume: number) => void;
  seekTo: (percentage: number) => void;
  stop: () => void;
  activeContext: 'player' | 'playlist' | null;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startingRef = useRef(false);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(80);
  const [activeContext, setActiveContext] = useState<'player' | 'playlist' | null>(null);

  // Cleanup audio on unmount only (lazy-init the element on first play)
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  // Update volume when it changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [volume]);

  const playSong = async (song: Song, context: 'player' | 'playlist' = 'player') => {
    if (!song.url) {
      console.log('Cannot play song: missing URL', song);
      return;
    }

    // Lazy-initialize the audio element on first user interaction
    if (!audioRef.current) {
      // Create a real DOM audio element to improve iOS Safari compatibility
      const audio = document.createElement('audio');
      audio.setAttribute('preload', 'auto');
      audio.setAttribute('playsinline', 'true');
      audio.style.display = 'none';
      audio.crossOrigin = 'anonymous';
      document.body.appendChild(audio);
      audio.volume = volume / 100;

      const handleLoadedMetadata = () => {
        setDuration(audio.duration);
      };

      const handleTimeUpdate = () => {
        if (audio.duration > 0) {
          setProgress((audio.currentTime / audio.duration) * 100);
        }
      };

      const handleEnded = () => {
        setIsPlaying(false);
        setProgress(0);
      };

      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);

      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('play', handlePlay);
      audio.addEventListener('pause', handlePause);

      audioRef.current = audio as HTMLAudioElement;
    }

    const audio = audioRef.current;

    // If it's the same song, just toggle play/pause
    if (currentSong?.id === song.id) {
      // Don't check startingRef here - allow play/pause toggle even during startup
      if (audio.paused) {
        try { 
          await audio.play(); 
        } catch (e) { 
          console.error('Play error:', e); 
        }
      } else {
        audio.pause();
      }
      return;
    }

    // Prevent overlapping start requests for different songs
    if (startingRef.current) {
      console.log('Already starting a song, ignoring new request');
      return;
    }
    startingRef.current = true;

    try {
      // Stop current song and prepare new source
      audio.pause();
      audio.src = song.url;
      audio.currentTime = 0;
      
      setCurrentSong(song);
      setActiveContext(context);
      setProgress(0);

      // Load the audio and start playing
      audio.load();
      
      // Wait for audio to be ready and start playback
      await new Promise<void>((resolve, reject) => {
        let resolved = false;
        
        const cleanup = () => {
          audio.removeEventListener('canplaythrough', onCanPlay);
          audio.removeEventListener('error', onError);
        };
        
        const onCanPlay = () => {
          if (resolved) return;
          cleanup();
          
          audio.play()
            .then(() => {
              resolved = true;
              console.log('Song started successfully');
              // Force playing state update
              setIsPlaying(true);
              resolve();
            })
            .catch((err) => {
              if (!resolved && (err as any)?.name === 'AbortError') {
                console.log('AbortError detected, retrying...');
                audio.play()
                  .then(() => {
                    resolved = true;
                    setIsPlaying(true);
                    resolve();
                  })
                  .catch(reject);
              } else {
                reject(err);
              }
            });
        };
        
        const onError = (e: Event) => {
          cleanup();
          reject(new Error('Failed to load audio'));
        };
        
        audio.addEventListener('canplaythrough', onCanPlay);
        audio.addEventListener('error', onError);
      });

      // Track play in database (best-effort)
      await supabase.rpc('track_song_play', {
        _song_id: song.id,
        _user_id: (await supabase.auth.getUser()).data.user?.id || null
      });
    } catch (error) {
      console.error('Failed to play song:', error);
    } finally {
      startingRef.current = false;
    }
  };

  const pause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
  };

  const resume = () => {
    if (audioRef.current) {
      audioRef.current.play().catch(console.error);
    }
  };

  const setVolume = (newVolume: number) => {
    setVolumeState(newVolume);
  };

  const seekTo = (percentage: number) => {
    if (audioRef.current && duration > 0) {
      audioRef.current.currentTime = (percentage / 100) * duration;
    }
  };

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setCurrentSong(null);
      setActiveContext(null);
      setProgress(0);
      setIsPlaying(false);
    }
  };

  return (
    <AudioContext.Provider
      value={{
        currentSong,
        isPlaying,
        progress,
        duration,
        volume,
        playSong,
        pause,
        resume,
        setVolume,
        seekTo,
        stop,
        activeContext,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}

export function useAudioPlayer() {
  const context = useContext(AudioContext);
  if (context === undefined) {
    throw new Error('useAudioPlayer must be used within an AudioProvider');
  }
  return context;
}
