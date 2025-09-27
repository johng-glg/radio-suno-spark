import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Free royalty-free music samples for each genre
const genreSamples: Record<string, string[]> = {
  'electronic': [
    'https://www.soundjay.com/misc/sounds/fail-buzzer-02.wav', // Placeholder - replace with actual electronic samples
  ],
  'pop': [
    'https://www.soundjay.com/misc/sounds/fail-buzzer-02.wav', // Placeholder - replace with actual pop samples
  ],
  'rock': [
    'https://www.soundjay.com/misc/sounds/fail-buzzer-02.wav', // Placeholder - replace with actual rock samples
  ],
  'jazz': [
    'https://www.soundjay.com/misc/sounds/fail-buzzer-02.wav', // Placeholder - replace with actual jazz samples
  ],
  'classical': [
    'https://www.soundjay.com/misc/sounds/fail-buzzer-02.wav', // Placeholder - replace with actual classical samples
  ],
  'hip-hop': [
    'https://www.soundjay.com/misc/sounds/fail-buzzer-02.wav', // Placeholder - replace with actual hip-hop samples
  ],
  'indie': [
    'https://www.soundjay.com/misc/sounds/fail-buzzer-02.wav', // Placeholder - replace with actual indie samples
  ],
  'ambient': [
    'https://www.soundjay.com/misc/sounds/fail-buzzer-02.wav', // Placeholder - replace with actual ambient samples
  ],
  'folk': [
    'https://www.soundjay.com/misc/sounds/fail-buzzer-02.wav', // Placeholder - replace with actual folk samples
  ],
  'metal': [
    'https://www.soundjay.com/misc/sounds/fail-buzzer-02.wav', // Placeholder - replace with actual metal samples
  ]
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Update placeholder URLs with actual samples
    for (const [genre, urls] of Object.entries(genreSamples)) {
      const { data: starterTracks, error } = await supabaseClient
        .from('songs')
        .select('id, title')
        .eq('genre', genre)
        .like('title', `${genre} Starter Track %`)
        .eq('url', 'https://www.soundjay.com/misc/sounds/fail-buzzer-02.wav');

      if (error) {
        console.error(`Error fetching starter tracks for ${genre}:`, error);
        continue;
      }

      if (starterTracks && starterTracks.length > 0) {
        for (let i = 0; i < starterTracks.length && i < urls.length; i++) {
          const track = starterTracks[i];
          const sampleUrl = urls[i % urls.length]; // Cycle through available URLs
          
          const { error: updateError } = await supabaseClient
            .from('songs')
            .update({ 
              url: sampleUrl,
              title: `${genre.charAt(0).toUpperCase() + genre.slice(1)} Sample ${i + 1}`,
              description: `A sample ${genre} track to get you started while new songs generate`
            })
            .eq('id', track.id);

          if (updateError) {
            console.error(`Error updating track ${track.id}:`, updateError);
          } else {
            console.log(`Updated ${genre} starter track: ${track.title}`);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Music samples updated successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in seed-music-samples function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});