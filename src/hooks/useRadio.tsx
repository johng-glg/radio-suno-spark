import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { useAudioPlayer } from '@/contexts/AudioContext';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export type Song = Tables<'songs'>;
export type Station = Tables<'stations'>;

export interface RadioSettings {
  genres: string[];
  mood: string | null;
  instrumental: boolean;
  wildcard: boolean;
  holiday: string | null;
}

const DEFAULT_SETTINGS: RadioSettings = {
  genres: [],
  mood: null,
  instrumental: false,
  wildcard: false,
  holiday: null,
};

export type Taste = Record<string, number>;

interface RadioContextType {
  status: 'idle' | 'tuning' | 'on-air';
  settings: RadioSettings;
  current: Song | null;
  upNext: Song | null;
  station: Station | null;
  taste: Taste;
  brewing: Song[];
  lastFeedback: 'like' | 'dislike' | null;
  tuneIn: (overrides?: Partial<RadioSettings>) => Promise<void>;
  tuneOut: () => void;
  skip: () => Promise<void>;
  like: () => Promise<void>;
  dislike: () => Promise<void>;
  steer: (changes: Partial<RadioSettings>) => void;
  saveStation: (name: string) => Promise<boolean>;
  renameStation: (name: string) => Promise<void>;
}

const RadioContext = createContext<RadioContextType | undefined>(undefined);

/** How many tracks play between background commission attempts. */
const COMMISSION_EVERY = 2;
/** How much of the session history we send as a replay-exclusion list. */
const EXCLUDE_WINDOW = 40;

export function RadioProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'idle' | 'tuning' | 'on-air'>('idle');
  const [settings, setSettings] = useState<RadioSettings>(DEFAULT_SETTINGS);
  const [current, setCurrent] = useState<Song | null>(null);
  const [upNext, setUpNext] = useState<Song | null>(null);
  const [station, setStation] = useState<Station | null>(null);
  const [taste, setTaste] = useState<Taste>({});
  const [brewing, setBrewing] = useState<Song[]>([]);
  const [lastFeedback, setLastFeedback] = useState<'like' | 'dislike' | null>(null);

  const { playSong, preload, stop } = useAudioPlayer();
  const { user } = useAuth();
  const { toast } = useToast();

  // Refs so event handlers always see fresh state without re-subscribing
  const playedIdsRef = useRef<string[]>([]);
  const advancingRef = useRef(false);
  const tracksSinceCommissionRef = useRef(0);
  const stateRef = useRef({ status, settings, current, upNext, station });
  stateRef.current = { status, settings, current, upNext, station };

  // ---------- server calls ----------

  const fetchNext = useCallback(async (
    opts: { settings: RadioSettings; stationId: string | null; extraExclude?: string[] }
  ): Promise<Song | null> => {
    const exclude = [
      ...playedIdsRef.current.slice(-EXCLUDE_WINDOW),
      ...(opts.extraExclude ?? []),
    ];
    const { data, error } = await supabase.rpc('next_track', {
      p_station: opts.stationId ?? undefined,
      p_genres: opts.settings.genres,
      p_mood: opts.settings.mood ?? undefined,
      p_exclude: exclude,
    });
    if (error) {
      console.error('next_track failed:', error);
      return null;
    }
    return (data?.[0] as Song) ?? null;
  }, []);

  const sendFeedback = useCallback(async (songId: string, signal: string): Promise<void> => {
    const st = stateRef.current.station;
    if (!st) return; // anonymous listeners steer with the dial only
    const { data, error } = await supabase.rpc('record_feedback', {
      p_station: st.id,
      p_song: songId,
      p_signal: signal,
    });
    if (error) {
      console.error('record_feedback failed:', error);
    } else if (data && typeof data === 'object') {
      setTaste(data as Taste);
    }
  }, []);

  const maybeCommission = useCallback(async (force = false) => {
    const st = stateRef.current.station;
    if (!st) return;
    tracksSinceCommissionRef.current += 1;
    if (!force && tracksSinceCommissionRef.current < COMMISSION_EVERY) return;
    tracksSinceCommissionRef.current = 0;
    // Fire-and-forget: server-side guardrails decide whether the studio
    // actually takes the order (returns null when caps are hit).
    const { error } = await supabase.rpc('commission_track', { p_station: st.id });
    if (error) console.warn('commission_track skipped:', error.message);
  }, []);

  // ---------- playback flow ----------

  const playAndTrack = useCallback((song: Song) => {
    playedIdsRef.current.push(song.id);
    setCurrent(song);
    setLastFeedback(null);
    playSong(
      {
        id: song.id,
        title: song.title ?? 'Untitled',
        url: song.url ?? undefined,
        genre: song.genre,
        mood: song.mood ?? undefined,
        image_url: song.image_url ?? undefined,
      },
      'player'
    );
  }, [playSong]);

  const prefetchUpNext = useCallback(async (
    activeSettings: RadioSettings,
    stationId: string | null,
    currentId?: string
  ) => {
    const next = await fetchNext({
      settings: activeSettings,
      stationId,
      extraExclude: currentId ? [currentId] : [],
    });
    setUpNext(next);
    if (next?.url) preload(next.url);
  }, [fetchNext, preload]);

  const tuneIn = useCallback(async (overrides?: Partial<RadioSettings>) => {
    const active = { ...stateRef.current.settings, ...overrides };
    setSettings(active);
    setStatus('tuning');

    const song = await fetchNext({
      settings: active,
      stationId: stateRef.current.station?.id ?? null,
    });

    if (!song?.url) {
      setStatus('idle');
      toast({
        title: 'Nothing on this frequency',
        description: 'No ready tracks match that dial position yet. Try widening the genres.',
        variant: 'destructive',
      });
      return;
    }

    playAndTrack(song);
    setStatus('on-air');
    prefetchUpNext(active, stateRef.current.station?.id ?? null, song.id);
    maybeCommission(true); // stock the shelf as soon as a station goes on air
  }, [fetchNext, playAndTrack, prefetchUpNext, maybeCommission, toast]);

  const advance = useCallback(async (signalForCurrent: 'complete' | 'skip' | null) => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    try {
      const { current: cur, settings: cfg, station: st, upNext: queued } = stateRef.current;
      if (cur && signalForCurrent) sendFeedback(cur.id, signalForCurrent);

      let next = queued;
      setUpNext(null);
      if (!next?.url) {
        next = await fetchNext({
          settings: cfg,
          stationId: st?.id ?? null,
          extraExclude: cur ? [cur.id] : [],
        });
      }

      if (!next?.url) {
        setStatus('idle');
        toast({ title: 'End of the airwaves', description: 'No more tracks match this station right now.' });
        return;
      }

      playAndTrack(next);
      prefetchUpNext(cfg, st?.id ?? null, next.id);
      maybeCommission();
    } finally {
      advancingRef.current = false;
    }
  }, [fetchNext, playAndTrack, prefetchUpNext, sendFeedback, maybeCommission, toast]);

  const skip = useCallback(() => advance('skip'), [advance]);

  const like = useCallback(async () => {
    const cur = stateRef.current.current;
    if (!cur) return;
    setLastFeedback('like');
    await sendFeedback(cur.id, 'like');
  }, [sendFeedback]);

  const dislike = useCallback(async () => {
    const cur = stateRef.current.current;
    if (!cur) return;
    setLastFeedback('dislike');
    await sendFeedback(cur.id, 'dislike');
    advance(null); // the dislike already carries the negative signal
  }, [sendFeedback, advance]);

  const steer = useCallback((changes: Partial<RadioSettings>) => {
    const merged = { ...stateRef.current.settings, ...changes };
    setSettings(merged);
    // Persist dial position to the saved station
    const st = stateRef.current.station;
    if (st) {
      supabase
        .from('stations')
        .update({
          genres: merged.genres,
          mood: merged.mood,
          instrumental: merged.instrumental,
          wildcard: merged.wildcard,
          holiday: merged.holiday,
        })
        .eq('id', st.id)
        .then(({ error }) => error && console.error('station update failed:', error));
    }
    // Re-aim the prefetched track mid-flight
    if (stateRef.current.status === 'on-air') {
      prefetchUpNext(merged, st?.id ?? null, stateRef.current.current?.id);
    }
  }, [prefetchUpNext]);

  const tuneOut = useCallback(() => {
    stop();
    setStatus('idle');
    setCurrent(null);
    setUpNext(null);
  }, [stop]);

  const saveStation = useCallback(async (name: string): Promise<boolean> => {
    if (!user) return false;
    const cfg = stateRef.current.settings;
    const { data, error } = await supabase
      .from('stations')
      .insert({
        user_id: user.id,
        name,
        genres: cfg.genres,
        mood: cfg.mood,
        instrumental: cfg.instrumental,
        wildcard: cfg.wildcard,
        holiday: cfg.holiday,
      })
      .select()
      .single();
    if (error || !data) {
      console.error('saveStation failed:', error);
      toast({ title: 'Could not save station', description: error?.message, variant: 'destructive' });
      return false;
    }
    setStation(data);
    setTaste((data.taste as Taste) ?? {});
    localStorage.setItem('spark:last-station', data.id);
    toast({ title: `${name} is on the air`, description: 'From here on, every like and skip teaches it your taste.' });
    maybeCommission(true);
    return true;
  }, [user, toast, maybeCommission]);

  const renameStation = useCallback(async (name: string) => {
    const st = stateRef.current.station;
    if (!st) return;
    const { error } = await supabase.from('stations').update({ name }).eq('id', st.id);
    if (!error) setStation({ ...st, name });
  }, []);

  // ---------- lifecycle wiring ----------

  // Track end → count as a completed listen and advance
  useEffect(() => {
    const onEnded = () => {
      if (stateRef.current.status === 'on-air') advance('complete');
    };
    const onSkipRequest = () => {
      if (stateRef.current.status === 'on-air') advance('skip');
    };
    window.addEventListener('song-ended', onEnded);
    window.addEventListener('radio-skip', onSkipRequest);
    return () => {
      window.removeEventListener('song-ended', onEnded);
      window.removeEventListener('radio-skip', onSkipRequest);
    };
  }, [advance]);

  // Signed-in users: restore their most recent station (settings only — no autoplay)
  useEffect(() => {
    if (!user) {
      setStation(null);
      setTaste({});
      return;
    }
    let cancelled = false;
    (async () => {
      const remembered = localStorage.getItem('spark:last-station');
      let query = supabase.from('stations').select('*');
      query = remembered
        ? query.eq('id', remembered)
        : query.order('last_tuned_at', { ascending: false, nullsFirst: false });
      const { data } = await query.limit(1).maybeSingle();
      if (cancelled || !data) return;
      setStation(data);
      setTaste((data.taste as Taste) ?? {});
      setSettings({
        genres: data.genres ?? [],
        mood: data.mood,
        instrumental: data.instrumental,
        wildcard: data.wildcard,
        holiday: data.holiday,
      });
    })();
    return () => { cancelled = true; };
  }, [user]);

  // "On the stove" strip: watch this station's in-flight commissions
  useEffect(() => {
    if (!station) {
      setBrewing([]);
      return;
    }
    let known = new Set<string>();
    const poll = async () => {
      const { data } = await supabase
        .from('songs')
        .select('*')
        .eq('station_id', station.id)
        .in('status', ['generating', 'ready'])
        .order('created_at', { ascending: false })
        .limit(6);
      const rows = (data ?? []) as Song[];
      const cooking = rows.filter((s) => s.status === 'generating');
      setBrewing(cooking);
      // Toast when a commissioned track lands
      for (const s of rows) {
        if (s.status === 'ready' && known.has(s.id)) {
          known.delete(s.id);
          toast({ title: 'Fresh from the studio', description: `“${s.title ?? 'New track'}” just landed on your station.` });
        }
      }
      for (const s of cooking) known.add(s.id);
    };
    poll();
    const interval = setInterval(poll, 20_000);
    return () => clearInterval(interval);
  }, [station, toast]);

  return (
    <RadioContext.Provider
      value={{
        status, settings, current, upNext, station, taste, brewing, lastFeedback,
        tuneIn, tuneOut, skip, like, dislike, steer, saveStation, renameStation,
      }}
    >
      {children}
    </RadioContext.Provider>
  );
}

export function useRadio() {
  const ctx = useContext(RadioContext);
  if (ctx === undefined) throw new Error('useRadio must be used within a RadioProvider');
  return ctx;
}
