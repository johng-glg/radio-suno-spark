import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MOODS = ['upbeat', 'chill', 'aggressive', 'emotional', 'epic', 'playful'];

const DESCRIPTORS: Record<string, string[]> = {
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

    const rows = Array.from({ length: count }, (_, i) => {
      const genre = genres[i % genres.length];
      const mood = pick(moods);
      const descriptor = pick(DESCRIPTORS[genre] ?? ['distinctive textures', 'memorable melodies']);
      const instrumental = genre === 'classical' || genre === 'jazz';
      const prompt = `A ${mood} ${genre} track featuring ${descriptor}, well produced and radio ready${instrumental ? ', instrumental, no vocals' : ''}`;
      return {
        prompt,
        genre,
        mood,
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
