import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('Checking for stuck songs in generating status...');

    // Find songs that have been generating for more than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: stuckSongs, error: fetchError } = await supabaseClient
      .from('songs')
      .select('id, title, created_at, updated_at')
      .eq('status', 'generating')
      .lt('updated_at', tenMinutesAgo);

    if (fetchError) {
      console.error('Error fetching stuck songs:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    let cleanedCount = 0;

    if (stuckSongs && stuckSongs.length > 0) {
      console.log(`Found ${stuckSongs.length} stuck songs, marking as failed`);

      // Mark stuck songs as failed
      const { error: updateError } = await supabaseClient
        .from('songs')
        .update({ 
          status: 'failed',
          description: 'Generation timed out or failed to complete'
        })
        .in('id', stuckSongs.map(song => song.id));

      if (updateError) {
        console.error('Error updating stuck songs:', updateError);
      } else {
        cleanedCount = stuckSongs.length;
        console.log(`Successfully marked ${cleanedCount} songs as failed`);
      }

      // Also remove them from the queue
      const { error: queueError } = await supabaseClient
        .from('queue')
        .delete()
        .in('song_id', stuckSongs.map(song => song.id));

      if (queueError) {
        console.error('Error removing stuck songs from queue:', queueError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Cleaned up ${cleanedCount} stuck songs`,
        cleaned_count: cleanedCount
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
})