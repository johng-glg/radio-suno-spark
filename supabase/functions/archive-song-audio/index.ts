import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { archiveSongAudio, isStemAudioUrl, selectFullMixAudioUrl } from '../_shared/archiveAudio.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Backfill: pull each song's audio into our own storage. Where the stored link
// has already expired, ask Suno for a fresh one via the saved task/clip id.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Admin-only
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: isAdmin } = await userClient.rpc('has_role', {
      _user_id: userData.user.id,
      _role: 'admin',
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let limit = 25;
    try {
      const body = await req.json();
      if (typeof body?.limit === 'number') limit = Math.min(100, Math.max(1, body.limit));
    } catch { /* no body */ }

    const sunoApiKey = Deno.env.get('SUNO_API_KEY');

    const { data: songs, error } = await serviceClient
      .from('songs')
      .select('id, url, suno_id, storage_path')
      .or('storage_path.is.null,url.ilike.%/stems/%')
      .not('url', 'is', null)
      .in('status', ['ready', 'completed'])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    let archived = 0;
    let recovered = 0;
    let failed = 0;

    for (const song of songs ?? []) {
      let sourceUrl: string | null = null;
      let path: string | null = null;

      // Always recover from the provider's finished audio_url first. The URL
      // saved on older rows points at source/stem output and can sound static.
      if (song.suno_id && sunoApiKey) {
        try {
          const resp = await fetch(`https://api.sunoapi.com/api/v1/suno/task/${song.suno_id}`, {
            headers: { Authorization: `Bearer ${sunoApiKey}` },
          });
          if (resp.ok) {
            const task = await resp.json();
            const taskItems = Array.isArray(task?.data)
              ? task.data
              : Array.isArray(task?.data?.data)
                ? task.data.data
                : [];
            const item = taskItems.find((candidate: Record<string, unknown>) => selectFullMixAudioUrl(candidate));
            sourceUrl = selectFullMixAudioUrl(item);
            if (sourceUrl) {
              path = await archiveSongAudio(serviceClient, song.id, sourceUrl);
              if (path) {
                recovered++;
                await serviceClient
                  .from('songs')
                  .update({ url: sourceUrl })
                  .eq('id', song.id);
              }
            }
          } else {
            console.error(`Refresh from Suno failed (${resp.status}) for song ${song.id}`);
          }
        } catch (e) {
          console.error('Refresh from Suno failed for song', song.id, e);
        }
      }

      // Preserve support for old non-provider URLs, but never re-archive the
      // known source/stem URLs that produced the static copies.
      if (!path && !isStemAudioUrl(song.url)) {
        sourceUrl = song.url as string;
        path = await archiveSongAudio(serviceClient, song.id, sourceUrl);
      }

      if (path) archived++;
      else failed++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked: songs?.length ?? 0,
        archived,
        recovered,
        failed,
        remaining_hint: (songs?.length ?? 0) === limit,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('archive-song-audio error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
