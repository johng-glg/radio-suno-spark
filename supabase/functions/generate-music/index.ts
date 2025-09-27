import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SunoGenerateRequest {
  user_id?: string;
  use_build_prompt?: boolean;
  wild_card_mode?: boolean;
  // Legacy fields for backwards compatibility
  prompt?: string;
  title?: string;
  genre?: string;
  mood?: string;
  make_instrumental?: boolean;
  wait_audio?: boolean;
}

interface SunoResponse {
  id: string;
  title?: string;
  audio_url?: string;
  status: string;
  image_url?: string;
  lyric?: string;
  model_name?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { 
      user_id, 
      use_build_prompt = true, 
      wild_card_mode = false,
      prompt: legacyPrompt,
      genre: legacyGenre,
      mood: legacyMood,
      title,
      make_instrumental = false, 
      wait_audio = true 
    } = await req.json() as SunoGenerateRequest;

    let finalPrompt = legacyPrompt;
    let promptMetadata: any = {};

    // Use Build Prompt workflow if enabled
    if (use_build_prompt && !legacyPrompt) {
      console.log('Using Build Prompt workflow');
      
      // Call the build-prompt function
      const buildPromptResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/build-prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
        },
        body: JSON.stringify({
          user_id,
          wild_card_mode
        })
      });

      if (!buildPromptResponse.ok) {
        throw new Error('Failed to build prompt');
      }

      const buildPromptData = await buildPromptResponse.json();
      if (!buildPromptData.success) {
        throw new Error(buildPromptData.error || 'Failed to build prompt');
      }

      finalPrompt = buildPromptData.prompt;
      promptMetadata = {
        template_used: buildPromptData.template_used,
        selected_words: buildPromptData.selected_words,
        wild_card_applied: buildPromptData.wild_card_applied
      };

      console.log('Generated prompt:', finalPrompt);
      console.log('Prompt metadata:', promptMetadata);
    }

    if (!finalPrompt) {
      throw new Error('No prompt provided or generated');
    }

    // Extract genre from selected words or use legacy genre
    const genre = promptMetadata.selected_words?.genre || legacyGenre || 'electronic';
    const mood = promptMetadata.selected_words?.mood || legacyMood;

    console.log('Generating music with Suno API:', { 
      prompt: finalPrompt, 
      genre, 
      mood, 
      title,
      make_instrumental 
    });

    // Create initial song record in database
    const { data: song, error: insertError } = await supabaseClient
      .from('songs')
      .insert({
        prompt: finalPrompt,
        genre,
        mood,
        title: title || `${genre} Track`,
        status: 'generating',
        description: promptMetadata.template_used ? `Generated from: ${promptMetadata.template_used}` : undefined
      })
      .select()
      .single();

    if (insertError || !song) {
      throw new Error(`Failed to create song record: ${insertError?.message}`);
    }

    console.log('Created song record:', song.id);

    // Call Suno API to generate music
    const sunoApiKey = Deno.env.get('SUNO_API_KEY');
    if (!sunoApiKey) {
      throw new Error('Suno API key not configured');
    }

    const sunoResponse = await fetch('https://api.suno.ai/bark/v1/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sunoApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: finalPrompt,
        title: title || `${genre} Track`,
        make_instrumental,
        wait_audio
      }),
    });

    if (!sunoResponse.ok) {
      const errorText = await sunoResponse.text();
      console.error('Suno API error:', errorText);
      
      // Check if it's a 503 service unavailable error
      if (sunoResponse.status === 503) {
        console.log('Suno API unavailable, creating demo song record');
        
        // Create a demo song record for testing
        const { error: updateError } = await supabaseClient
          .from('songs')
          .update({ 
            status: 'completed',
            title: title || `${genre} Demo Track`,
            url: 'https://www.soundjay.com/misc/bell-ringing-05.wav', // Demo audio URL
            description: `Demo track: ${finalPrompt}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', song.id);

        if (updateError) {
          console.error('Failed to update demo song:', updateError);
        } else {
          // Add to queue
          const { data: queueCount } = await supabaseClient
            .from('queue')
            .select('position')
            .order('position', { ascending: false })
            .limit(1);

          const nextPosition = queueCount && queueCount.length > 0 ? queueCount[0].position + 1 : 1;

          await supabaseClient
            .from('queue')
            .insert({
              song_id: song.id,
              position: nextPosition,
              status: 'queued'
            });

          console.log('Added demo song to queue at position:', nextPosition);
        }

        return new Response(JSON.stringify({
          success: true,
          song_id: song.id,
          suno_id: 'demo-' + song.id,
          status: 'completed',
          audio_url: 'https://www.soundjay.com/misc/bell-ringing-05.wav',
          title: title || `${genre} Demo Track`,
          prompt: finalPrompt,
          prompt_metadata: promptMetadata,
          demo_mode: true
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Update song status to failed for other errors
      await supabaseClient
        .from('songs')
        .update({ status: 'failed', description: `API Error: ${errorText}` })
        .eq('id', song.id);

      throw new Error(`Suno API error: ${sunoResponse.status} ${errorText}`);
    }

    const sunoData: SunoResponse[] = await sunoResponse.json();
    console.log('Suno API response:', sunoData);

    if (!sunoData || sunoData.length === 0) {
      throw new Error('No music generated by Suno API');
    }

    const generatedTrack = sunoData[0];

    // Update song record with generated data
    const updateData: any = {
      status: generatedTrack.audio_url ? 'completed' : 'generating',
      title: generatedTrack.title || song.title,
      updated_at: new Date().toISOString()
    };

    if (generatedTrack.audio_url) {
      updateData.url = generatedTrack.audio_url;
    }

    if (generatedTrack.lyric) {
      updateData.description = generatedTrack.lyric;
    }

    const { error: updateError } = await supabaseClient
      .from('songs')
      .update(updateData)
      .eq('id', song.id);

    if (updateError) {
      console.error('Failed to update song:', updateError);
    }

    // Add to queue if song is completed
    if (generatedTrack.audio_url) {
      const { data: queueCount } = await supabaseClient
        .from('queue')
        .select('position')
        .order('position', { ascending: false })
        .limit(1);

      const nextPosition = queueCount && queueCount.length > 0 ? queueCount[0].position + 1 : 1;

      const { error: queueError } = await supabaseClient
        .from('queue')
        .insert({
          song_id: song.id,
          position: nextPosition,
          status: 'queued'
        });

      if (queueError) {
        console.error('Failed to add to queue:', queueError);
      } else {
        console.log('Added song to queue at position:', nextPosition);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      song_id: song.id,
      suno_id: generatedTrack.id,
      status: generatedTrack.status,
      audio_url: generatedTrack.audio_url,
      title: generatedTrack.title || song.title,
      prompt: finalPrompt,
      prompt_metadata: promptMetadata
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-music function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});