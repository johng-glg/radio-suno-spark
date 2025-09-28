import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SunoClip {
  id: string;
  audio_url: string;
  image_url: string;
  title: string;
  status: string;
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

    console.log('Fetching songs with missing image URLs...');

    // Get all songs that don't have image_url but have a suno_id
    const { data: songsWithoutImages, error: fetchError } = await supabaseClient
      .from('songs')
      .select('id, suno_id, title')
      .is('image_url', null)
      .neq('suno_id', null)
      .eq('status', 'ready');

    if (fetchError) {
      console.error('Error fetching songs:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`Found ${songsWithoutImages?.length || 0} songs without image URLs`);

    if (!songsWithoutImages || songsWithoutImages.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'All songs already have image URLs',
          updated_count: 0
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const sunoApiKey = Deno.env.get('SUNO_API_KEY');
    if (!sunoApiKey) {
      console.error('SUNO_API_KEY not found');
      return new Response(
        JSON.stringify({ success: false, error: 'SUNO_API_KEY not configured' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    let updatedCount = 0;

    // Process each song
    for (const song of songsWithoutImages) {
      try {
        console.log(`Fetching image URL for song: ${song.title} (${song.suno_id})`);

        // Get clip details from Suno API
        const clipResponse = await fetch(`https://studio-api.suno.ai/api/external/clips/?ids=${song.suno_id}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${sunoApiKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (!clipResponse.ok) {
          console.error(`Failed to fetch clip details for ${song.suno_id}:`, clipResponse.statusText);
          continue;
        }

        const clipData = await clipResponse.json();
        const clips: SunoClip[] = clipData;

        if (clips && clips.length > 0) {
          const clip = clips[0];
          if (clip.image_url) {
            // Update the song with the image URL
            const { error: updateError } = await supabaseClient
              .from('songs')
              .update({ image_url: clip.image_url })
              .eq('id', song.id);

            if (updateError) {
              console.error(`Failed to update song ${song.id}:`, updateError);
            } else {
              console.log(`Updated ${song.title} with image URL: ${clip.image_url}`);
              updatedCount++;
            }
          } else {
            console.log(`No image URL found for ${song.title}`);
          }
        }
      } catch (error) {
        console.error(`Error processing song ${song.id}:`, error);
      }

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`Successfully updated ${updatedCount} songs with image URLs`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Updated ${updatedCount} songs with image URLs`,
        updated_count: updatedCount
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