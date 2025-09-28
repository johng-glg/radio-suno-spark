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
          wild_card_mode,
          genre: legacyGenre,
          mood: legacyMood
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

    // Call Suno API (SunoAPI async flow: create -> poll task)
    const sunoApiKey = Deno.env.get('SUNO_API_KEY');
    if (!sunoApiKey) {
      throw new Error('Suno API key not configured');
    }

    // Check for existing generating songs to avoid concurrency issues
    const { data: existingGenerating } = await supabaseClient
      .from('songs')
      .select('id')
      .eq('status', 'generating')
      .limit(1);

    if (existingGenerating && existingGenerating.length > 0) {
      console.log('Another song is already generating, applying backoff...');
      // Wait a bit and retry once
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const { data: stillGenerating } = await supabaseClient
        .from('songs')
        .select('id')
        .eq('status', 'generating')
        .limit(1);
        
      if (stillGenerating && stillGenerating.length > 0) {
        throw new Error('Concurrency limit: Another song is still generating');
      }
    }

    // Use no-custom mode since our prompt is a description, not full lyrics
    const createPayload: Record<string, unknown> = {
      custom_mode: false,
      gpt_description_prompt: finalPrompt,
      make_instrumental,
      mv: 'chirp-v5', // default model; can be adjusted later from user prefs
    };

    if (title) createPayload.title = title;
    if (genre) createPayload.tags = genre;

    const createResp = await fetch('https://api.sunoapi.com/api/v1/suno/create', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sunoApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createPayload),
    });

    if (!createResp.ok) {
      const errText = await createResp.text();
      console.error('Suno create API error:', errText);

      // Mark song as failed
      await supabaseClient
        .from('songs')
        .update({ status: 'failed', description: `Create API Error: ${errText}` })
        .eq('id', song.id);

      throw new Error(`Suno create API error: ${createResp.status} ${errText}`);
    }

    const createData = await createResp.json();
    const taskId: string | undefined = createData?.task_id;

    if (!taskId) {
      console.error('Missing task_id from Suno create response:', createData);
      await supabaseClient
        .from('songs')
        .update({ status: 'failed', description: 'No task_id returned from Suno' })
        .eq('id', song.id);
      throw new Error('No task_id returned from Suno');
    }

    // Poll task endpoint until succeeded or timeout
    const maxWaitMs = 180_000; // 3 minutes for generation
    const pollIntervalMs = 10_000; // 10 seconds
    const startTime = Date.now();

    let finalResult: any | null = null;
    
    console.log(`Starting to poll Suno task ${taskId}`);
    
    while (Date.now() - startTime < maxWaitMs) {
      try {
        const taskResp = await fetch(`https://api.sunoapi.com/api/v1/suno/task/${taskId}`, {
          method: 'GET',
          headers: { 
            'Authorization': `Bearer ${sunoApiKey}`,
            'Content-Type': 'application/json'
          },
        });

        if (!taskResp.ok) {
          const tErr = await taskResp.text();
          console.error(`Suno task poll error (${taskResp.status}):`, tErr);
        } else {
          const tData = await taskResp.json();
          console.log('Suno API response:', JSON.stringify(tData, null, 2));
          
          if (tData.code === 200 && Array.isArray(tData.data) && tData.data.length > 0) {
            // Suno may return multiple clips; pick the first one that's succeeded
            const succeededItem = tData.data.find((item: any) => item.state === 'succeeded' && item.audio_url);
            
            if (succeededItem) {
              finalResult = succeededItem;
              console.log('Found succeeded task:', succeededItem.clip_id);
              break;
            } else {
              // Check if any are still running/pending
              const runningItems = tData.data.filter((item: any) => 
                item.state === 'running' || item.state === 'pending'
              );
              console.log(`Still processing: ${runningItems.length} items in progress`);
            }
          }
        }
      } catch (error) {
        console.error('Error polling Suno task:', error);
      }

      // Wait before next poll
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    // Prepare update based on poll result
    const updateData: any = {
      status: finalResult?.audio_url ? 'ready' : 'generating',
      title: finalResult?.title || song.title,
      updated_at: new Date().toISOString(),
      suno_id: finalResult?.clip_id  // Store the Suno clip ID for fetching images later
    };

    if (finalResult?.audio_url) {
      updateData.url = finalResult.audio_url;
      console.log('Updating song with audio URL:', finalResult.audio_url);
    }

    if (finalResult?.image_url) {
      updateData.image_url = finalResult.image_url;
      console.log('Updating song with image URL:', finalResult.image_url);
    }

    if (finalResult?.lyrics) {
      // Generate a proper description instead of using lyrics
      const moodText = genre && finalResult.tags ? 
        `A ${finalResult.tags.includes('peaceful') ? 'peaceful' : 
           finalResult.tags.includes('energetic') ? 'energetic' : 
           finalResult.tags.includes('dreamy') ? 'dreamy' : 
           finalResult.tags.includes('intense') ? 'intense' : 'atmospheric'} ` : '';
      
      const genreText = genre ? `${genre} ` : '';
      
      // Extract key instruments from tags if available
      const instruments = finalResult.tags ? 
        finalResult.tags.match(/\b(piano|guitar|violin|flute|drums|bass|saxophone|synth|electronic)\b/gi)?.slice(0, 2) || [] : [];
      const instrumentText = instruments.length > 0 ? ` featuring ${instruments.join(' and ')}` : '';
      
      updateData.description = `${moodText}${genreText}composition${instrumentText} with unique musical elements`;
    }

    const { error: updateError } = await supabaseClient
      .from('songs')
      .update(updateData)
      .eq('id', song.id);

    if (updateError) {
      console.error('Failed to update song:', updateError);
    }

    // Add to queue if song is ready
    if (finalResult?.audio_url) {
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
          status: 'queued',
        });

      if (queueError) {
        console.error('Failed to add to queue:', queueError);
      } else {
        console.log('Added song to queue at position:', nextPosition);
      }
    }

    // Store task_id as suno_id for tracking
    const { error: taskUpdateError } = await supabaseClient
      .from('songs')
      .update({ suno_id: taskId })
      .eq('id', song.id);

    if (taskUpdateError) {
      console.error('Failed to store task ID:', taskUpdateError);
    }

    // Return immediately - completion will be handled by scheduled function
    return new Response(
      JSON.stringify({
        success: true,
        song_id: song.id,
        task_id: taskId,
        status: 'generating',
        message: 'Generation started, will complete automatically'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

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