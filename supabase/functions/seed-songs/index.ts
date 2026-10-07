import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MOODS = ['upbeat', 'chill', 'aggressive', 'emotional', 'epic', 'playful'];

const DESCRIPTORS: Record<string, string[]> = {
  brasscore: [
    'festival synths, saxophone hooks, heavy bass drop, four-on-the-floor',
    'electro swing beat, dubstep wobble, jazzy saxophone licks',
    'jazzstep drums, neuro bass, saxophone riffs, rolling percussion',
    'jazz piano chords, sax solo, 808s, festival drop',
    'big band horn accents over a pounding EDM drop, dance floor energy',
  ],
  classical: ['sweeping strings', 'solo piano', 'chamber ensemble', 'cinematic orchestra'],
  country: ['slide guitar', 'front-porch banjo', 'dusty road rhythm', 'honky-tonk piano'],
  edm: ['festival synths', 'deep bassline', 'rolling arpeggios', 'euphoric drop'],
  'hip-hop': ['boom-bap drums', 'smoky sample loop', 'trap hi-hats', 'heavy 808s'],
  jazz: ['brushed drums', 'walking bass', 'muted trumpet', 'late-night piano trio'],
  pop: ['bright synth hooks', 'anthemic chorus', 'crisp modern drums', 'shimmering guitars'],
  rock: ['driving guitars', 'stadium drums', 'fuzzy riffs', 'raw garage energy'],
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Not signed in' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: isAdmin } = await userClient.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const count = Math.max(1, Math.min(50, Number(body?.count) || 5));
    let genres: string[] = Array.isArray(body?.genres)
      ? body.genres.map((g: string) => String(g).toLowerCase().trim()).filter(Boolean)
      : [];
    const moods: string[] = Array.isArray(body?.moods) && body.moods.length
      ? body.moods.map((m: string) => String(m).toLowerCase().trim()).filter(Boolean)
      : MOODS;

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    if (genres.length === 0) {
      const { data: pool } = await serviceClient.from('word_pools').select('value').eq('type', 'genre');
      genres = (pool ?? []).map((p: { value: string }) => String(p.value).toLowerCase());
      if (genres.length === 0) genres = Object.keys(DESCRIPTORS);
    }

    const holiday: string | null = body?.holiday ? String(body.holiday).toLowerCase().trim() : null;
    const forceInstrumental = body?.instrumental === true;
    let twists: string[] = [];
    if (body?.wildcard === true) {
      const { data: tw } = await serviceClient.from('word_pools').select('value').eq('type', 'twist');
      twists = (tw ?? []).map((t: { value: string }) => String(t.value));
    }

    // "More like this": reuse a source song's recipe with fresh variations
    if (body?.like_song_id) {
      const { data: src, error: srcErr } = await serviceClient
        .from('songs').select('id, prompt, genre, mood, holiday, title')
        .eq('id', String(body.like_song_id)).maybeSingle();
      if (srcErr || !src) {
        return new Response(JSON.stringify({ error: 'Source song not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const VARIATIONS = ['a fresh take', 'a new melody', 'a different hook', 'an alternate arrangement', 'a new chord progression'];
      const likeRows = Array.from({ length: count }, () => ({
        prompt: `${src.prompt}, ${pick(VARIATIONS)} in the same style`,
        genre: src.genre,
        mood: src.mood,
        holiday: src.holiday,
        title: src.title ? `${src.title} (Like This)` : 'More Like This',
        status: 'generating',
        description: `More like "${src.title ?? 'this'}"`,
        is_public: true,
        requested_by: null,
      }));
      const { data: ins, error: insErr } = await serviceClient.from('songs').insert(likeRows).select('id');
      if (insErr) throw insErr;
      serviceClient.functions.invoke('complete-pending-generations').catch(() => {});
      return new Response(JSON.stringify({ success: true, created: ins?.length ?? 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rows = Array.from({ length: count }, (_, i) => {
      const genre = body?.randomGenre ? pick(genres) : genres[i % genres.length];
      const mood = pick(moods);
      const descriptor = pick(DESCRIPTORS[genre] ?? ['distinctive textures', 'memorable melodies']);
      const instrumental = forceInstrumental || genre === 'classical' || genre === 'jazz';
      // Describe brasscore as a fusion so prompts don't lean brass
      const genreLabel = genre === 'brasscore' ? 'edm and jazz fusion' : genre;
      let prompt = `A ${mood} ${genreLabel} track featuring ${descriptor}, well produced and radio ready`;
      if (twists.length) prompt += `, ${pick(twists)}`;
      if (holiday) prompt += `, with a ${holiday} theme`;
      if (instrumental) prompt += ', instrumental, no vocals';
      return {
        prompt,
        genre,
        mood,
        holiday,
        title: `${genre.charAt(0).toUpperCase() + genre.slice(1)} ${mood.charAt(0).toUpperCase() + mood.slice(1)}`,
        status: 'generating',
        description: `Seeded ${mood} ${genre} track`,
        is_public: true,
        requested_by: null,
      };
    });

    const { data: inserted, error } = await serviceClient.from('songs').insert(rows).select('id, genre, mood, title');
    if (error) throw error;

    // Kick the worker so tasks get created right away
    serviceClient.functions.invoke('complete-pending-generations').catch(() => {});

    return new Response(JSON.stringify({ success: true, created: inserted?.length ?? 0, songs: inserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('seed-songs error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
