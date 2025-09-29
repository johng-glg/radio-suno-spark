import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Play, Pause, SkipForward, ThumbsUp, ThumbsDown, 
  Settings, Music, Clock, Volume2, ArrowLeft, LogOut, User, Sparkles, Info, RefreshCw
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useMusicGeneration } from "@/hooks/useMusicGeneration";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { supabase } from "@/integrations/supabase/client";
import SettingsPopup from "@/components/SettingsPopup";

interface Song {
  id: string;
  title: string;
  description?: string;
  genre: string;
  mood?: string;
  url?: string;
  image_url?: string;
  status: 'generating' | 'ready' | 'failed';
  prompt?: string;
  created_at?: string;
  updated_at?: string;
  requested_by?: string | null;
  // New fields for Build Prompt metadata
  prompt_metadata?: {
    template_used?: string;
    selected_words?: Record<string, string>;
    wild_card_applied?: boolean;
  };
  // User interaction
  user_interaction?: 'like' | 'dislike' | null;
}

interface PlayerPageProps {
  selectedGenres: string[];
  selectedMood?: string;
  instrumentalMode?: boolean;
  wildcardMode?: boolean;
  onBack: () => void;
  onSettingsUpdate?: (settings: {
    genres: string[];
    mood?: string;
    instrumentalMode: boolean;
    wildcardMode: boolean;
  }) => void;
}

export default function PlayerPage({ selectedGenres, selectedMood, instrumentalMode = false, wildcardMode = false, onBack, onSettingsUpdate }: PlayerPageProps) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState([80]);
  const [currentInteraction, setCurrentInteraction] = useState<'like' | 'dislike' | null>(null);
  const [showPromptInfo, setShowPromptInfo] = useState(false);
  const [lastDislikedElements, setLastDislikedElements] = useState<{mood?: string, instrument?: string}>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [exhaustedGenreMoods, setExhaustedGenreMoods] = useState<Set<string>>(new Set());
  const [isSkipping, setIsSkipping] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const generationLockRef = useRef(false); // prevent concurrent generations
  const initializationRef = useRef(false); // prevent multiple initializations
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const { generateWithBuildPrompt, isGenerating } = useMusicGeneration();
  const { preferences, toggleWildCardMode, addExclusion, updatePreferences } = useUserPreferences();
  

  // Audio element setup
  useEffect(() => {
    if (audioRef.current) {
      const audio = audioRef.current;
      
      const handleLoadedMetadata = () => {
        setDuration(audio.duration);
      };
      
      const handleTimeUpdate = () => {
        setProgress((audio.currentTime / audio.duration) * 100);
      };
      
      const handleEnded = async () => {
        console.log('Song ended - auto-advancing to next track');
        try {
          await handleSkip();
          console.log('Auto-advance completed successfully');
        } catch (error) {
          console.error('Auto-advance failed:', error);
          // Reset isSkipping if auto-advance fails
          setIsSkipping(false);
        }
      };
      
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('ended', handleEnded);
      
      return () => {
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('ended', handleEnded);
      };
    }
  }, [currentSong]);

  // Volume control
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume[0] / 100;
    }
  }, [volume]);

  // Load interaction status when song changes
  useEffect(() => {
    if (currentSong && user) {
      const loadInteraction = async () => {
        const { data } = await supabase
          .from('user_song_interactions')
          .select('interaction_type')
          .eq('user_id', user.id)
          .eq('song_id', currentSong.id)
          .maybeSingle();
        
        setCurrentInteraction(data?.interaction_type as 'like' | 'dislike' | null || null);
      };
      loadInteraction();
    }
  }, [currentSong, user]);

  // Auto-play when a new song loads
  useEffect(() => {
    if (currentSong?.url && audioRef.current) {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        // Track the play when song auto-plays successfully
        trackSongPlay();
      }).catch((error) => {
        console.log('Auto-play prevented by browser:', error);
        // Don't show error toast for auto-play prevention, it's expected behavior
      });
    }
  }, [currentSong?.url]);

  // Initialize queue with new priority-based system
  useEffect(() => {
    // Prevent duplicate initializations
    if (initializationRef.current) {
      console.log('Initialization already in progress, skipping...');
      return;
    }
    
    initializationRef.current = true;
    
    // Clear existing songs when genre selection changes
    console.log('Genre/mood changed, initializing new queue...');
    setCurrentSong(null);
    setQueue([]);
    setExhaustedGenreMoods(new Set());
    
    const initializeQueue = async () => {
      try {
        // Clear the database queue
        await supabase.from('queue').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        console.log('Database queue cleared');
        
        // Load 1 current song + 1 next (library-first)
        const song1 = await getNextSongByPriority();
        
        if (song1) {
          console.log('Setting first priority song as current:', song1.title);
          setCurrentSong(song1);
          toast({
            title: "Music Ready!",
            description: `Playing ${song1.title} instantly`,
          });
          
          // Check if we can get a second library song as next
          const song2 = await getNextSongByPriority(song1.id);
          if (song2) {
            console.log('Adding second priority song to queue:', song2.title);
            await addSongToQueue(song2);
          } else {
            // Try genre-only fallback before generating
            const genreOnly = await getRandomGenreAnyMood(song1.id);
            if (genreOnly) {
              console.log('Adding genre-only fallback song to queue:', genreOnly.title);
              await addSongToQueue(genreOnly);
            } else {
              // Only generate if no library songs available in genre (excluding current)
              const hasLibrarySongs = await checkLibrarySongsAvailable(song1.id, true);
              if (!hasLibrarySongs) {
                console.log('No library songs available in genre (excluding current), starting generation...');
                setTimeout(() => {
                  startGenerationTask();
                }, 1000);
              }
            }
          }
        }
        
      } catch (error) {
        console.error('Error initializing queue:', error);
        toast({
          title: "Error",
          description: "Failed to initialize music queue. Please try again.",
          variant: "destructive"
        });
      } finally {
        // Reset initialization flag after a delay
        setTimeout(() => {
          initializationRef.current = false;
        }, 2000);
      }
    };
    
    initializeQueue();
    
    // Set up real-time subscription to queue changes
    const queueChannel = supabase
      .channel('queue-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'queue'
        },
        () => {
          console.log('Queue changed, refreshing display...');
          pollForNewSongs();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public', 
          table: 'songs'
        },
        (payload) => {
          console.log('Song updated:', payload);
          pollForNewSongs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(queueChannel);
      initializationRef.current = false;
    };
  }, [selectedGenres, selectedMood]);

  // New priority-based song selection system
  const getNextSongByPriority = async (excludeSongId?: string): Promise<Song | null> => {
    try {
      const genresLowerCase = selectedGenres.map(g => g.toLowerCase());
      const genreMoodKey = `${genresLowerCase.join(',')}-${selectedMood || 'any'}`;
      
      console.log('Getting next song by priority for:', genreMoodKey);
      
      // Priority 1: Random unplayed song matching both Genre + Mood
      if (!exhaustedGenreMoods.has(genreMoodKey)) {
        const unplayedSong = await getUnplayedGenreMoodSong(excludeSongId);
        if (unplayedSong) {
          console.log('Priority 1: Found unplayed Genre+Mood song:', unplayedSong.title);
          return unplayedSong;
        } else {
          // Mark this Genre+Mood as exhausted
          setExhaustedGenreMoods(prev => new Set([...prev, genreMoodKey]));
          console.log('Genre+Mood combination exhausted:', genreMoodKey);
          
          // If generate_when_exhausted is true, trigger background generation while we find something to play
          if (preferences.generate_when_exhausted) {
            console.log('No unplayed songs for', genreMoodKey, 'will generate fresh content while finding something to play...');
            // Trigger background generation (don't await)
            generateWithBuildPrompt(preferences.wild_card_mode, false, selectedGenres, selectedMood, true)
              .catch(error => console.error('Background generation failed:', error));
          }
        }
      }
      
      // Priority 2: Random song matching Genre that has been Liked by user
      if (user) {
        const likedSong = await getLikedGenreSong(excludeSongId);
        if (likedSong) {
          console.log('Priority 2: Found liked Genre song:', likedSong.title);
          return likedSong;
        }
      }
      
      // Priority 3: Any random song from the Genre + Mood
      const randomGenreSong = await getRandomGenreSong(excludeSongId);
      if (randomGenreSong) {
        console.log('Priority 3: Found random Genre+Mood song:', randomGenreSong.title);
        return randomGenreSong;
      }
      
  // Priority 4: Only use other moods if user preference allows it
      // If mood is specified and we've exhausted Genre+Mood, generate new songs instead of falling back
      if (selectedMood) {
        console.log('Priority 4: Mood specified and Genre+Mood exhausted, generating new songs for:', selectedMood);
        return null; // Trigger generation for the specific mood
      }
      
      // Priority 4.5: Any random song from the Genre (ignore mood) - only if no mood specified
      const randomAnyMood = await getRandomGenreAnyMood(excludeSongId);
      if (randomAnyMood) {
        console.log('Priority 4.5: Found random Genre (any mood) song:', randomAnyMood.title);
        return randomAnyMood;
      }
      
      // Priority 5: Generate new song (return null to trigger generation)
      console.log('Priority 5: No library songs available in genre, need generation');
      return null;
      
    } catch (error) {
      console.error('Error in getNextSongByPriority:', error);
      return null;
    }
  };

  // Priority 1: Get unplayed song matching Genre + Mood
  const getUnplayedGenreMoodSong = async (excludeSongId?: string): Promise<Song | null> => {
    if (!user) return null;
    
    try {
      const genresLowerCase = selectedGenres.map(g => g.toLowerCase());
      
      let query = supabase
        .from('songs')
        .select('*')
        .eq('status', 'ready')
        .is('requested_by', null) // Library songs only
        .eq('is_public', true) // Only public library songs
        .not('url', 'is', null);
      
      if (genresLowerCase.length > 0) {
        query = query.in('genre', genresLowerCase);
      }
      
      if (selectedMood) {
        query = query.eq('mood', selectedMood.toLowerCase());
      }
      
      if (excludeSongId) {
        query = query.neq('id', excludeSongId);
      }
      
      const { data: songs, error } = await query.limit(50);
      
      if (error || !songs || songs.length === 0) {
        console.log('Priority 1: No unplayed Genre+Mood songs found');
        return null;
      }
      
      console.log(`Priority 1: Found ${songs.length} Genre+Mood songs, checking play status`);
      
      // Filter to only unplayed songs
      const unplayedSongs = [];
      for (const song of songs) {
        const { data: playData } = await supabase
          .from('user_song_plays')
          .select('play_count')
          .eq('user_id', user.id)
          .eq('song_id', song.id)
          .maybeSingle();
          
        if (!playData || playData.play_count === 0) {
          unplayedSongs.push(song);
        }
      }
      
      if (unplayedSongs.length === 0) {
        console.log('Priority 1: All Genre+Mood songs have been played');
        return null;
      }
      
      console.log(`Priority 1: Found ${unplayedSongs.length} unplayed Genre+Mood songs`);
      // Return random unplayed song
      const randomSong = unplayedSongs[Math.floor(Math.random() * unplayedSongs.length)];
      console.log(`Priority 1: Selected unplayed song: ${randomSong.title} (${randomSong.genre} - ${randomSong.mood})`);
      return cleanSongObject(randomSong);
      
    } catch (error) {
      console.error('Error getting unplayed Genre+Mood song:', error);
      return null;
    }
  };

  // Priority 2: Get liked song matching Genre + Mood
  const getLikedGenreSong = async (excludeSongId?: string): Promise<Song | null> => {
    if (!user) return null;
    
    try {
      const genresLowerCase = selectedGenres.map(g => g.toLowerCase());
      console.log(`Priority 2: Looking for liked songs - Genre: ${genresLowerCase.join(',')}, Mood: ${selectedMood || 'any'}`);
      
      let query = supabase
        .from('songs')
        .select(`
          *,
          user_song_interactions!inner(interaction_type)
        `)
        .eq('status', 'ready')
        .is('requested_by', null) // Library songs only
        .eq('is_public', true) // Only public library songs
        .not('url', 'is', null)
        .eq('user_song_interactions.user_id', user.id)
        .eq('user_song_interactions.interaction_type', 'like');
      
      if (genresLowerCase.length > 0) {
        query = query.in('genre', genresLowerCase);
      }
      
      // Add mood filtering - this was missing!
      if (selectedMood) {
        query = query.eq('mood', selectedMood.toLowerCase());
      }
      
      if (excludeSongId) {
        query = query.neq('id', excludeSongId);
      }
      
      const { data: songs, error } = await query.limit(20);
      
      if (error || !songs || songs.length === 0) {
        console.log('Priority 2: No liked Genre+Mood songs found');
        return null;
      }
      
      console.log(`Priority 2: Found ${songs.length} liked Genre+Mood songs`);
      // Return random liked song
      const randomSong = songs[Math.floor(Math.random() * songs.length)];
      console.log(`Priority 2: Selected liked song: ${randomSong.title} (${randomSong.genre} - ${randomSong.mood})`);
      return cleanSongObject(randomSong);
      
    } catch (error) {
      console.error('Error getting liked Genre song:', error);
      return null;
    }
  };

  // Priority 3: Get any random song from Genre + Mood
  const getRandomGenreSong = async (excludeSongId?: string): Promise<Song | null> => {
    try {
      const genresLowerCase = selectedGenres.map(g => g.toLowerCase());
      console.log(`Priority 3: Looking for random songs - Genre: ${genresLowerCase.join(',')}, Mood: ${selectedMood || 'any'}`);
      
      let query = supabase
        .from('songs')
        .select('*')
        .eq('status', 'ready')
        .is('requested_by', null) // Library songs only
        .eq('is_public', true) // Only public library songs
        .not('url', 'is', null);
      
      if (genresLowerCase.length > 0) {
        query = query.in('genre', genresLowerCase);
      }
      
      // Mood-specific random
      if (selectedMood) {
        query = query.eq('mood', selectedMood.toLowerCase());
      }
      
      if (excludeSongId) {
        query = query.neq('id', excludeSongId);
      }
      
      const { data: songs, error } = await query.limit(30);
      
      if (error || !songs || songs.length === 0) {
        console.log('Priority 3: No random Genre+Mood songs found');
        return null;
      }
      
      console.log(`Priority 3: Found ${songs.length} random Genre+Mood songs`);
      // Return random song
      const randomSong = songs[Math.floor(Math.random() * songs.length)];
      console.log(`Priority 3: Selected random song: ${randomSong.title} (${randomSong.genre} - ${randomSong.mood})`);
      return cleanSongObject(randomSong);
      
    } catch (error) {
      console.error('Error getting random Genre song:', error);
      return null;
    }
  };

  // Priority 4: Get unplayed song from Genre (ignore mood), fallback to any genre song
  const getRandomGenreAnyMood = async (excludeSongId?: string): Promise<Song | null> => {
    try {
      const genresLowerCase = selectedGenres.map(g => g.toLowerCase());
      console.log(`Priority 4: Looking for unplayed songs by Genre: ${genresLowerCase.join(',')}`);
      
      let query = supabase
        .from('songs')
        .select('*')
        .eq('status', 'ready')
        .is('requested_by', null)
        .eq('is_public', true) // Only public library songs
        .not('url', 'is', null);
      
      if (genresLowerCase.length > 0) {
        query = query.in('genre', genresLowerCase);
      }
      
      if (excludeSongId) {
        query = query.neq('id', excludeSongId);
      }
      
      const { data: songs, error } = await query.limit(50);
      
      if (error || !songs || songs.length === 0) {
        console.log('Priority 4: No songs found by Genre');
        return null;
      }

      // If user is authenticated, try to find unplayed songs first
      if (user) {
        // Get user's played songs for this genre
        const { data: playedSongs, error: playsError } = await supabase
          .from('user_song_plays')
          .select('song_id')
          .eq('user_id', user.id)
          .in('song_id', songs.map(s => s.id));

        if (!playsError) {
          const playedSongIds = new Set(playedSongs?.map(p => p.song_id) || []);
          const unplayedSongs = songs.filter(song => !playedSongIds.has(song.id));
          
          if (unplayedSongs.length > 0) {
            const randomUnplayedSong = unplayedSongs[Math.floor(Math.random() * unplayedSongs.length)];
            console.log(`Priority 4: Selected unplayed song: ${randomUnplayedSong.title} (${randomUnplayedSong.genre} - ${randomUnplayedSong.mood})`);
            return cleanSongObject(randomUnplayedSong);
          }
          
          console.log('Priority 4: All genre songs have been played, falling back to any genre song');
        }
      }
      
      // Fallback: return any random song from the genre
      const randomSong = songs[Math.floor(Math.random() * songs.length)];
      console.log(`Priority 4: Selected random genre song: ${randomSong.title} (${randomSong.genre} - ${randomSong.mood})`);
      return cleanSongObject(randomSong);
    } catch (error) {
      console.error('Error getting random Genre song:', error);
      return null;
    }
  };

  // Helper function to clean song object
  const cleanSongObject = (song: any): Song => {
    return {
      id: song.id,
      title: song.title,
      description: song.description,
      genre: song.genre,
      mood: song.mood,
      url: song.url,
      image_url: song.image_url,
      status: song.status as 'generating' | 'ready' | 'failed',
      prompt: song.prompt,
      created_at: song.created_at,
      updated_at: song.updated_at,
      requested_by: song.requested_by,
      prompt_metadata: song.prompt_metadata || undefined,
      user_interaction: null
    };
  };

  // Check if there are any library songs available for current selection
  const checkLibrarySongsAvailable = async (excludeSongId?: string, ignoreMood: boolean = false): Promise<boolean> => {
    try {
      const genresLowerCase = selectedGenres.map(g => g.toLowerCase());
      
      let query = supabase
        .from('songs')
        .select('id')
        .eq('status', 'ready')
        .is('requested_by', null) // Library songs only
        .eq('is_public', true) // Only public library songs
        .not('url', 'is', null);
      
      if (genresLowerCase.length > 0) {
        query = query.in('genre', genresLowerCase);
      }
      
      if (!ignoreMood && selectedMood) {
        query = query.eq('mood', selectedMood.toLowerCase());
      }
      
      if (excludeSongId) {
        query = query.neq('id', excludeSongId);
      }
      
      const { data: songs, error } = await query.limit(1);
      
      if (error) {
        console.error('Error checking library songs:', error);
        return false;
      }
      
      return (songs && songs.length > 0);
      
    } catch (error) {
      console.error('Error checking library songs availability:', error);
      return false;
    }
  };

  // Start a generation task for selected Genre + Mood
  const startGenerationTask = async () => {
    if (generationLockRef.current || isGenerating) {
      console.log('Generation already in progress, skipping...');
      return;
    }
    
    generationLockRef.current = true;
    console.log('Starting generation task for Genre + Mood...');
    
    try {
      await generateWithBuildPrompt(wildcardMode, instrumentalMode, selectedGenres, selectedMood, true);
    } catch (error) {
      console.error('Error in generation task:', error);
    } finally {
      setTimeout(() => {
        generationLockRef.current = false;
      }, 5000);
    }
  };

  const addSongToQueue = async (song: Song) => {
    try {
      // Guard: only add songs matching current selected genres
      const genresLowerCase = selectedGenres.map(g => g.toLowerCase());
      if (genresLowerCase.length > 0 && !genresLowerCase.includes((song.genre || '').toLowerCase())) {
        console.log('Skipping addSongToQueue: song genre does not match selection', song.genre, selectedGenres);
        return;
      }

      // Check if song already in queue
      const { data: existingQueue } = await supabase
        .from('queue')
        .select('id')
        .eq('song_id', song.id)
        .maybeSingle();
        
      if (existingQueue) return; // Already in queue
      
      // Get next position
      const { data: queueCount } = await supabase
        .from('queue')
        .select('position')
        .order('position', { ascending: false })
        .limit(1);
        
      const nextPosition = queueCount && queueCount.length > 0 ? queueCount[0].position + 1 : 1;
      
      // Add to queue
      await supabase.from('queue').insert({
        song_id: song.id,
        position: nextPosition,
        status: 'queued'
      });
      
      console.log('Added song to queue at position:', nextPosition);
    } catch (error) {
      console.error('Error adding song to queue:', error);
    }
  };

  // Get unplayed genre+mood songs for current user
  const getGenreMoodUnplayed = async (excludeSongId?: string, excludeSecondId?: string) => {
    if (!user) return null;
    
    const genresLowerCase = selectedGenres?.map(g => g.toLowerCase()) || [];
    const moodLowerCase = selectedMood?.toLowerCase();
    
    if (genresLowerCase.length === 0 || !moodLowerCase) return null;
    
    try {
      let query = supabase
        .from('songs')
        .select('*')
        .eq('status', 'ready')
        .is('requested_by', null)
        .eq('is_public', true)
        .not('url', 'is', null);
      
      if (genresLowerCase.length > 0) {
        query = query.in('genre', genresLowerCase);
      }
      if (moodLowerCase) {
        query = query.eq('mood', moodLowerCase);
      }
      if (excludeSongId) {
        query = query.neq('id', excludeSongId);
      }
      if (excludeSecondId) {
        query = query.neq('id', excludeSecondId);
      }
      
      const { data: songs, error } = await query;
      
      if (error || !songs || songs.length === 0) {
        return null;
      }
      
      // Filter to only unplayed songs for this user
      const unplayedSongs = [];
      for (const song of songs) {
        const { data: playData } = await supabase
          .from('user_song_plays')
          .select('play_count')
          .eq('user_id', user.id)
          .eq('song_id', song.id)
          .maybeSingle();
          
        if (!playData || playData.play_count === 0) {
          unplayedSongs.push(song);
        }
      }
      
      if (unplayedSongs.length === 0) return null;
      
      // Return random unplayed song
      const randomIndex = Math.floor(Math.random() * unplayedSongs.length);
      return unplayedSongs[randomIndex];
      
    } catch (error) {
      console.error('Error in getGenreMoodUnplayed:', error);
      return null;
    }
  };

  // Simplified queue system with clear priority order
  const maintainQueue = async () => {
    try {
      const readySongs = queue.filter(song => song.status === 'ready' && song.url);
      const generatingSongs = queue.filter(song => song.status === 'generating');
      
      console.log(`Maintaining queue - current status: ${readySongs.length} ready, ${generatingSongs.length} generating`);
      
      // Only add songs if we have less than 2 ready songs
      if (readySongs.length < 2) {
        console.log('Queue needs more songs');
        
        // Step 1: Try to find ONE unplayed genre+mood match
        const unplayedGenreMood = await getGenreMoodUnplayed(currentSong?.id);
        if (unplayedGenreMood) {
          console.log('Found unplayed genre+mood match:', unplayedGenreMood.title);
          await addSongToQueue(unplayedGenreMood);
          return; // Found what we need, exit early
        }
        
        // Step 2: If no unplayed genre+mood, find ONE genre match and generate ONE song
        const anyGenreMatch = await getRandomGenreAnyMood(currentSong?.id);
        if (anyGenreMatch) {
          console.log('No unplayed genre+mood found, using genre fallback:', anyGenreMatch.title);
          await addSongToQueue(anyGenreMatch);
        }
        
        // Generate ONE song if no generating songs and generation enabled
        if (preferences.generate_when_exhausted && generatingSongs.length === 0) {
          console.log('Starting single song generation...');
          generateWithBuildPrompt(preferences.wild_card_mode, false, selectedGenres, selectedMood, true)
            .catch(error => console.error('Generation failed:', error));
        }
      }
      
      console.log('Queue maintenance complete');
    } catch (error) {
      console.error('Error maintaining queue:', error);
    }
  };

  const pollForNewSongs = async () => {
    try {
      const { data: queueData, error } = await supabase
        .from('queue')
        .select(`
          id,
          songs (
            id,
            title,
            description,
            genre,
            mood,
            url,
            image_url,
            status,
            requested_by
          ),
          status
        `)
        .order('position', { ascending: true })
        .limit(10);

      if (error) {
        console.error('Error polling for songs:', error);
        return;
      }

      const genresLowerCase = selectedGenres.map(g => g.toLowerCase());

      if (queueData && queueData.length > 0) {
        // Map to include queue id for targeted deletes, then filter by user and genre
        const items = queueData
          .map(item => ({ song: item.songs as Song | null, queueId: item.id }))
          .filter(item => !!item.song)
          .filter(item => {
            const s = item.song as Song;
            const genreOk = genresLowerCase.length === 0 || genresLowerCase.includes((s.genre || '').toLowerCase());
            const ownerOk = s.requested_by === null || (user?.id ? s.requested_by === user.id : true);
            return genreOk && ownerOk;
          });

        // Extract just the songs for UI
        const filteredSongs = items.map(i => i.song!) as Song[];

        // If we don't have a current song yet, pick the first ready one matching filters and remove it from queue
        if (!currentSong) {
          const firstReady = filteredSongs.find(song => song.status === 'ready' && !!song.url);
          if (firstReady) {
            console.log('Setting first ready filtered song as current:', firstReady);
            setCurrentSong(firstReady);

            const queueItem = queueData.find(item => item.songs?.id === firstReady.id);
            if (queueItem) {
              await supabase.from('queue').delete().eq('id', queueItem.id);
            }

            // Remove it from our local array too
            const idx = filteredSongs.findIndex(s => s.id === firstReady.id);
            if (idx >= 0) filteredSongs.splice(idx, 1);
          }
        }

        // Show remaining songs in queue (filtered)
        setQueue(filteredSongs);
      } else {
        // No songs in queue
        setQueue([]);
      }
    } catch (error) {
      console.error('Error polling for songs:', error);
    }
  };

  // Poll for song updates every 5 seconds
  useEffect(() => {
    const interval = setInterval(pollForNewSongs, 5000);
    return () => clearInterval(interval);
  }, [currentSong]);

  const trackSongPlay = async () => {
    if (!currentSong?.id) return;

    try {
      const { error } = await supabase.rpc('track_song_play', {
        _song_id: currentSong.id,
        _user_id: user?.id || null
      });

      if (error) {
        console.error('Error tracking song play:', error);
      }
    } catch (error) {
      console.error('Error tracking song play:', error);
    }
  };

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().then(() => {
          // Track the play when song successfully starts playing
          trackSongPlay();
        }).catch(() => {
          toast({
            title: "Playback Error",
            description: "Unable to play audio. This is a demo - actual audio files would be loaded from Suno API.",
            variant: "destructive"
          });
        });
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSkip = async () => {
    if (isSkipping) {
      console.log('Skip already in progress, ignoring request');
      return;
    }
    
    setIsSkipping(true);
    console.log('Starting skip operation...');
    
    try {
      console.log('Skip button clicked - checking queue state...');
      // Get next ready song from database queue (not local state to avoid stale data)
      const { data: readyQueueItems } = await supabase
        .from('queue')
        .select('*, songs(*)')
        .eq('status', 'ready')
        .not('songs.url', 'is', null)
        .order('position');
      
      const readySongs = readyQueueItems?.map(item => item.songs as Song).filter(Boolean) || [];
      console.log(`Database queue state: ${readySongs.length} ready songs available`);
      
      if (readySongs.length > 0) {
        const nextSong = readySongs[0];
        console.log('Moving to next song:', nextSong.title);
        
        // Remove from database queue
        const { data: queueItem } = await supabase
          .from('queue')
          .select('id')
          .eq('song_id', nextSong.id)
          .maybeSingle();
          
        if (queueItem) {
          await supabase.from('queue').delete().eq('id', queueItem.id);
          console.log('Removed song from database queue');
        }
        
        setCurrentSong(nextSong);
        setProgress(0);
        
        toast({
          title: 'Next Track',
          description: nextSong.title,
        });
        
        // Always maintain queue after skipping to ensure we have next songs
        console.log('Maintaining queue after skip...');
        setTimeout(() => {
          maintainQueue();
        }, 500);
        
      } else {
        console.log('No ready songs in queue - trying to find/generate next song...');
        
        // Try to find a song immediately
        const nextSong = await getNextSongByPriority(currentSong?.id);
        if (nextSong) {
          console.log('Found priority song for immediate play:', nextSong.title);
          setCurrentSong(nextSong);
          setProgress(0);
          
          toast({
            title: 'Next Track',
            description: nextSong.title,
          });
          
          // Add to queue for UI display
          await addSongToQueue(nextSong);
          
          // Maintain queue to ensure we have more songs
          setTimeout(() => {
            maintainQueue();
          }, 500);
        } else {
          // No songs available
          console.log('No songs available - checking library and generation status');
          toast({
            title: "No Next Song",
            description: "Looking for more music that matches your preferences...",
            variant: "default"
          });
          
          await maintainQueue();
        }
      }
      
    } catch (error) {
      console.error('Error in handleSkip:', error);
      toast({
        title: "Skip Error",
        description: "Unable to skip to next song. Please try again.",
        variant: "destructive"
      });
    } finally {
      // Reduce timeout to allow faster manual control after auto-advance
      setTimeout(() => {
        setIsSkipping(false);
      }, 300); // Allow quicker manual control
    }
  };


  const handleLike = async (isLike: boolean) => {
    if (!currentSong || !user) return;

    try {
      const interactionType = isLike ? 'like' : 'dislike';
      
      // Save to database
      const { error } = await supabase
        .from('user_song_interactions')
        .upsert({
          user_id: user.id,
          song_id: currentSong.id,
          interaction_type: interactionType
        }, {
          onConflict: 'user_id,song_id'
        });

      if (error) {
        console.error('Error saving interaction:', error);
        toast({
          title: "Error",
          description: "Failed to save your reaction. Please try again.",
          variant: "destructive"
        });
        return;
      }

      // Update local state
      setCurrentInteraction(interactionType);

      if (isLike) {
        toast({
          title: "Liked!",
          description: "We'll play more tracks like this",
        });
      } else {
        // Handle thumbs down - exclude last used mood and instrument
        if (currentSong?.prompt_metadata?.selected_words) {
          const { mood, instrument } = currentSong.prompt_metadata.selected_words;
          
          if (mood) {
            addExclusion('mood', mood);
            setLastDislikedElements(prev => ({ ...prev, mood }));
          }
          if (instrument) {
            addExclusion('instrument', instrument);
            setLastDislikedElements(prev => ({ ...prev, instrument }));
          }
          
          toast({
            title: "Disliked",
            description: `We'll avoid ${mood ? mood + ' mood' : ''}${mood && instrument ? ' and ' : ''}${instrument ? instrument + ' sounds' : ''} in future tracks`,
          });
        } else {
          toast({
            title: "Disliked",
            description: "We'll try different styles in the future",
          });
        }
      }
    } catch (error) {
      console.error('Error handling like/dislike:', error);
      toast({
        title: "Error",
        description: "Failed to save your reaction. Please try again.",
        variant: "destructive"
      });
    }
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
      onBack(); // Navigate back to landing page
      toast({
        title: "Signed out",
        description: "You have been successfully signed out.",
      });
    }
  };


  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRefreshGeneration = async () => {
    if (generationLockRef.current || isGenerating) {
      console.log('Refresh skipped: generation already in progress');
      return;
    }
    generationLockRef.current = true;
    setIsRefreshing(true);
    try {
      // Clean up any stale "generating" rows first
      await supabase.functions.invoke('check-stuck-songs');

      const result = await generateWithBuildPrompt(
        wildcardMode,
        instrumentalMode,
        selectedGenres,
        selectedMood,
        true
      );

      if (result?.success) {
        toast({ title: 'Generating…', description: 'Started a new track' });
        // Kick an immediate poll so the UI updates quickly
        await pollForNewSongs();
      } else if (result && result.error?.toLowerCase().includes('concurrency')) {
        toast({ title: 'Please wait', description: 'A track is already generating' });
      }
    } catch (error) {
      console.error('Error starting generation:', error);
      toast({ title: 'Error', description: 'Failed to start music generation', variant: 'destructive' });
    } finally {
      setIsRefreshing(false);
      // Release lock after a brief delay to avoid double-presses
      setTimeout(() => { generationLockRef.current = false; }, 3000);
    }
  };


  const handleSettingsSave = (newSettings: {
    genres: string[];
    mood?: string;
    instrumentalMode: boolean;
    wildcardMode: boolean;
    generateWhenExhausted: boolean;
  }) => {
    // Update user preferences for wildcardMode
    if (newSettings.wildcardMode !== preferences.wild_card_mode) {
      toggleWildCardMode();
    }
    
    // Update user preferences for generateWhenExhausted
    if (newSettings.generateWhenExhausted !== preferences.generate_when_exhausted) {
      updatePreferences({ generate_when_exhausted: newSettings.generateWhenExhausted });
    }
    
    // Call the parent component to update settings (excluding the new preference as it's internal)
    onSettingsUpdate?.({
      genres: newSettings.genres,
      mood: newSettings.mood,
      instrumentalMode: newSettings.instrumentalMode,
      wildcardMode: newSettings.wildcardMode
    });
    
    toast({
      title: "Settings Updated",
      description: "New preferences will apply to next generated songs",
    });
  };

  const WaveformBars = () => (
    <div className="flex items-center justify-center space-x-1 h-16">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className={`bg-primary rounded-full w-1 ${isPlaying ? 'animate-waveform' : 'h-2'}`}
          style={{
            animationDelay: `${i * 0.1}s`,
            height: isPlaying ? 'auto' : '8px'
          }}
        />
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-4">
      <audio ref={audioRef} src={currentSong?.url} />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <Button variant="ghost" onClick={onBack} className="flex items-center space-x-2">
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Button>
        <div className="flex items-center space-x-2">
          <Music className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">AI Radio</h1>
        </div>
          <div className="flex items-center space-x-3">
            {user && (
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">{user.email}</span>
              </div>
            )}
            
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleSignOut}
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
      </div>

      <div className="max-w-2xl mx-auto space-y-8">
        {/* Now Playing */}
        <Card className="bg-card/50 backdrop-blur-sm">
          <CardContent className="p-8 text-center space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">{currentSong?.title || "Loading..."}</h2>
                {currentSong?.prompt_metadata && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPromptInfo(!showPromptInfo)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-muted-foreground">{currentSong?.description}</p>
              
              {/* Show prompt information when toggled */}
              {showPromptInfo && currentSong?.prompt_metadata && (
                <div className="bg-muted/20 rounded p-3 text-sm space-y-2">
                  <p><strong>Generated from:</strong> {currentSong.prompt_metadata.template_used}</p>
                  {currentSong.prompt_metadata.selected_words && (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(currentSong.prompt_metadata.selected_words).map(([key, value]) => (
                        <Badge key={key} variant="outline" className="text-xs">
                          {key}: {value}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {currentSong.prompt_metadata.wild_card_applied && (
                    <div className="flex items-center space-x-1">
                      <Sparkles className="h-3 w-3 text-yellow-400" />
                      <span className="text-yellow-400 text-xs">Wild Card Applied!</span>
                    </div>
                  )}
                </div>
              )}
              
              <div className="flex items-center justify-center space-x-2">
                {selectedGenres.map(genre => (
                  <Badge key={genre} variant="secondary">{genre}</Badge>
                ))}
                {selectedMood && (
                  <Badge variant="outline">{selectedMood}</Badge>
                )}
                {instrumentalMode && (
                  <Badge variant="outline" className="text-blue-400 border-blue-400/50">
                    <Volume2 className="h-3 w-3 mr-1" />
                    Instrumental
                  </Badge>
                )}
                {preferences.wild_card_mode && (
                  <Badge variant="outline" className="text-yellow-400 border-yellow-400/50">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Wild Card
                  </Badge>
                )}
              </div>
            </div>

            {/* Album Art / Waveform */}
            <div className="w-48 h-48 mx-auto bg-radio-surface rounded-lg flex items-center justify-center neon-glow overflow-hidden">
              {currentSong?.image_url ? (
                <img 
                  src={currentSong.image_url} 
                  alt={`${currentSong.title} album art`}
                  className="w-full h-full object-cover rounded-lg"
                />
              ) : (
                <WaveformBars />
              )}
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{formatTime((progress / 100) * duration)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center space-x-6">
              <Button
                variant="ghost"
                size="icon"
                className="player-control"
                onClick={() => setShowSettingsPopup(true)}
                title="Music Settings"
              >
                <Settings className="h-5 w-5" />
              </Button>
              
              <Button
                size="icon"
                className="h-16 w-16 rounded-full neon-glow"
                onClick={handlePlayPause}
              >
                {isPlaying ? (
                  <Pause className="h-8 w-8" />
                ) : (
                  <Play className="h-8 w-8" />
                )}
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                className="player-control"
                onClick={handleSkip}
                disabled={isSkipping || (!currentSong && queue.length === 0)}
                title={
                  isSkipping 
                    ? "Finding next song..." 
                    : queue.length === 0 && !currentSong
                    ? "No songs available"
                    : "Skip to next song"
                }
              >
                {isSkipping ? (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                ) : (
                  <SkipForward className="h-5 w-5" />
                )}
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                className={`player-control transition-colors ${currentInteraction === 'like' ? 'text-green-400 hover:text-green-300' : 'hover:text-green-400'}`}
                onClick={() => handleLike(true)}
              >
                <ThumbsUp className="h-5 w-5" />
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                className={`player-control transition-colors ${currentInteraction === 'dislike' ? 'text-red-400 hover:text-red-300' : 'hover:text-red-400'}`}
                onClick={() => handleLike(false)}
              >
                <ThumbsDown className="h-5 w-5" />
              </Button>
            </div>

            {/* Volume */}
            <div className="flex items-center space-x-3">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <Slider
                value={volume}
                onValueChange={setVolume}
                max={100}
                step={1}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground w-8">{volume[0]}</span>
            </div>
          </CardContent>
        </Card>

        {/* Queue Preview */}
        <Card className="bg-card/30 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Clock className="h-5 w-5" />
                <span className="text-lg font-semibold">Coming Up</span>
                {isGenerating && (
                  <Badge variant="secondary" className="ml-2">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse mr-1" />
                    Generating...
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefreshGeneration}
                disabled={isRefreshing || isGenerating}
                className="text-muted-foreground hover:text-foreground"
                title="Generate new music tracks"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <div className="space-y-3">
              {queue.filter(song => song.id !== currentSong?.id).slice(0, 3).map((song, index) => (
                <div key={song.id} className="flex items-center space-x-3 p-3 rounded-lg bg-muted/20">
                  <div className="w-10 h-10 rounded-md overflow-hidden bg-muted/40 flex-shrink-0">
                    {song.image_url ? (
                      <img 
                        src={song.image_url} 
                        alt={`${song.title} album art`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className={`w-full h-full flex items-center justify-center ${song.image_url ? 'hidden' : ''}`}>
                      <Music className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{song.title}</p>
                    <p className="text-sm text-muted-foreground">{song.description}</p>
                    {song.prompt_metadata?.wild_card_applied && (
                      <div className="flex items-center space-x-1 mt-1">
                        <Sparkles className="h-3 w-3 text-yellow-400" />
                        <span className="text-xs text-yellow-400">Wild Card</span>
                      </div>
                    )}
                  </div>
                  <Badge variant={song.status === 'ready' ? 'default' : 'secondary'}>
                    {song.status === 'ready' ? 'Ready' : 'Generating...'}
                  </Badge>
                </div>
              ))}
              {queue.filter(song => song.id !== currentSong?.id).length === 0 && !isGenerating && (
                <p className="text-center text-muted-foreground">Queue is empty. Generating new tracks...</p>
              )}
            </div>
            
            {/* Excluded preferences indicator */}
            {(preferences.excluded_moods.length > 0 || preferences.excluded_instruments.length > 0) && (
              <div className="mt-4 p-3 bg-muted/10 rounded border">
                <p className="text-xs text-muted-foreground mb-2">Currently avoiding:</p>
                <div className="flex flex-wrap gap-1">
                  {preferences.excluded_moods.map(mood => (
                    <Badge key={mood} variant="destructive" className="text-xs">
                      {mood} mood
                    </Badge>
                  ))}
                  {preferences.excluded_instruments.map(instrument => (
                    <Badge key={instrument} variant="destructive" className="text-xs">
                      {instrument}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Settings Popup */}
      <SettingsPopup
        isOpen={showSettingsPopup}
        onClose={() => setShowSettingsPopup(false)}
        currentGenres={selectedGenres}
        currentMood={selectedMood}
        instrumentalMode={instrumentalMode}
        wildcardMode={wildcardMode}
        generateWhenExhausted={preferences.generate_when_exhausted}
        onSaveSettings={handleSettingsSave}
      />
    </div>
  );
}