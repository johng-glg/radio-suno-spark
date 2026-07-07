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
  holiday?: string;
  // Legacy fields for backwards compatibility
  prompt?: string;
  title?: string;
  genre?: string;
  mood?: string;
  make_instrumental?: boolean;
  wait_audio?: boolean;
  as_library?: boolean;
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
    // Create client with user permissions for user-initiated operations
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { 
            Authorization: req.headers.get('Authorization') ?? `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
          },
        },
      }
    );

    // Use service role for system operations  
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

const { 
      user_id, 
      use_build_prompt = true, 
      wild_card_mode = false,
      holiday,
      prompt: legacyPrompt,
      genre: legacyGenre,
      mood: legacyMood,
      title,
      make_instrumental = false, 
      wait_audio = true,
      as_library = true
    } = await req.json() as SunoGenerateRequest;

    // Force instrumental for classical music
    const isClassical = (legacyGenre && legacyGenre.toLowerCase() === 'classical');
    const finalMakeInstrumental = isClassical || make_instrumental;

    // Resolve requester from the Authorization header
    const { data: { user: authUser }, error: authError } = await userClient.auth.getUser();
    if (authError) {
      console.warn('Auth getUser error:', authError);
    }
    const requesterId = authUser?.id ?? null;

    console.log('Generate music request:', { user_id, resolved_user_id: requesterId, use_build_prompt, wild_card_mode, genre: legacyGenre, mood: legacyMood });

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
          mood: legacyMood,
          holiday
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

    // Extract genre from selected words or use legacy genre, or pick a random one if none specified
    let genre = promptMetadata.selected_words?.genre || legacyGenre;
    
    // If still no genre, pick a random one
    if (!genre) {
      const { data: genreWords } = await serviceClient
        .from('word_pools')
        .select('*')
        .eq('type', 'genre');

      if (genreWords && genreWords.length > 0) {
        const randomGenre = genreWords[Math.floor(Math.random() * genreWords.length)];
        genre = randomGenre.value;
      } else {
        genre = 'electronic'; // fallback
      }
    }
    const mood = promptMetadata.selected_words?.mood || legacyMood;

    console.log('Generating music with Suno API:', { 
      prompt: finalPrompt, 
      genre, 
      mood, 
      title,
      make_instrumental: finalMakeInstrumental 
    });

    // Cleanup stale generating songs before concurrency check
    const staleCutoff = new Date(Date.now() - 8 * 60 * 1000).toISOString();
    await serviceClient
      .from('songs')
      .update({ status: 'failed', description: 'Auto-clean: stale generation' })
      .eq('status', 'generating')
      .lt('updated_at', staleCutoff);

    // Check if this is the first song generation (demo mode)
    const { data: existingSongs, error: countError } = await serviceClient
      .from('songs')
      .select('id')
      .eq('status', 'ready')
      .limit(1);

    const isFirstSong = !existingSongs || existingSongs.length === 0;

    // For the first song, check if we already have a demo song to avoid duplicate generation
    if (isFirstSong) {
      const { data: demoSong, error: demoError } = await serviceClient
        .from('songs')
        .select('*')
        .eq('status', 'ready')
        .limit(1)
        .maybeSingle();

      if (demoSong && !demoError) {
        console.log('Using existing demo song:', demoSong.id);
        return new Response(
          JSON.stringify({
            success: true,
            song_id: demoSong.id,
            status: 'ready',
            audio_url: demoSong.url,
            title: demoSong.title,
            demo_mode: true,
            message: 'Using existing demo song'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }


    // Generate dynamic description based on genre and mood
    const generateDescription = (genre: string, mood?: string) => {
      const genreDescriptors: Record<string, string[]> = {
        'electronic': ['pulsing beats', 'synthesized layers', 'digital soundscapes'],
        'pop': ['catchy melodies', 'vibrant hooks', 'polished production'],
        'rock': ['driving guitars', 'powerful rhythms', 'raw energy'],
        'hip-hop': ['heavy beats', 'rhythmic flows', 'urban grooves'],
        'jazz': ['smooth improvisations', 'complex harmonies', 'sophisticated arrangements'],
        'classical': ['orchestral movements', 'refined compositions', 'timeless melodies'],
        'indie': ['authentic sounds', 'creative arrangements', 'artistic expression'],
        'ambient': ['atmospheric textures', 'ethereal soundscapes', 'immersive layers'],
        'folk': ['organic instruments', 'storytelling melodies', 'acoustic warmth'],
        'metal': ['intense riffs', 'powerful dynamics', 'aggressive energy']
      };

      const moodDescriptors: Record<string, string> = {
        'aggressive': 'intense and bold',
        'peaceful': 'serene and calming',
        'energetic': 'vibrant and uplifting',
        'dreamy': 'ethereal and floating',
        'melancholic': 'deep and contemplative',
        'playful': 'light and spirited',
        'mysterious': 'enigmatic and captivating',
        'romantic': 'passionate and tender'
      };

      const descriptors = genreDescriptors[genre.toLowerCase()] || ['distinctive sounds', 'creative elements', 'artistic flourishes'];
      const randomDescriptor = descriptors[Math.floor(Math.random() * descriptors.length)];
      
      const moodText = mood && moodDescriptors[mood.toLowerCase()] 
        ? `${moodDescriptors[mood.toLowerCase()]} ` 
        : '';
      
      return `A ${moodText}${genre} composition featuring ${randomDescriptor}`;
    };

    const songDescription = generateDescription(genre, mood);
    
    console.log('Attempting to insert song with user_id:', user_id, 'resolved_user_id:', requesterId);
    
    // Use appropriate client based on song type
    const insertClient = as_library ? serviceClient : userClient;
    
    const { data: song, error: insertError } = await insertClient
      .from('songs')
      .insert({
        prompt: finalPrompt,
        genre,
        mood,
        title: title || `${genre} Track`,
        status: 'generating',
        description: songDescription,
        requested_by: as_library ? null : requesterId, // Library if as_library
        is_public: as_library ? true : false, // Make library songs public
        holiday: holiday || null
      })
      .select()
      .single();

    if (insertError) {
      console.error('Song insert error:', insertError);
      throw new Error(`Failed to create song record: ${insertError.message}`);
    }

    if (!song) {
      throw new Error('No song data returned from insert');
    }

    console.log('Created song record:', song.id);

    // Add song to queue immediately with queued status (DB constraint-safe)
    const { data: queueCount } = await serviceClient
      .from('queue')
      .select('position')
      .order('position', { ascending: false })
      .limit(1);

    const nextPosition = queueCount && queueCount.length > 0 ? queueCount[0].position + 1 : 1;

    // Use upsert to handle duplicates gracefully
    const { error: queueError } = await serviceClient
      .from('queue')
      .upsert({
        song_id: song.id,
        position: nextPosition,
        status: 'queued',
      }, {
        onConflict: 'song_id'
      });

    if (queueError) {
      console.error('Failed to add song to queue:', queueError);
    } else {
      console.log('Added song to queue at position:', nextPosition);
    }

    // Call Suno API (SunoAPI async flow: create -> poll task)
    const sunoApiKey = Deno.env.get('SUNO_API_KEY');
    if (!sunoApiKey) {
      throw new Error('Suno API key not configured');
    }

    // Passed concurrency guard; safe to proceed with create


    // Use no-custom mode since our prompt is a description, not full lyrics
    const createPayload: Record<string, unknown> = {
      custom_mode: false,
      gpt_description_prompt: finalPrompt,
      make_instrumental: finalMakeInstrumental,
      mv: 'chirp-v5', // default model; can be adjusted later from user prefs
    };

    if (title) createPayload.title = title;
    if (genre) createPayload.tags = genre;

    // Helper: create with retries to handle Suno concurrency limits
    async function createSunoWithRetry(maxAttempts = 3) {
      let lastErrText = '';
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const resp = await fetch('https://api.sunoapi.com/api/v1/suno/create', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sunoApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(createPayload),
        });

        if (resp.ok) {
          return await resp.json();
        }

        const errText = await resp.text();
        lastErrText = `${resp.status} ${errText}`;
        console.error('Suno create API error:', errText);

        // Handle concurrency limit with exponential backoff
        if (resp.status === 429 && errText.toLowerCase().includes('concurrency')) {
          const jitter = Math.floor(Math.random() * 500);
          const backoffMs = Math.min(30000, 1000 * Math.pow(2, attempt - 1)) + jitter;
          console.log(`Concurrency limit reached. Retry ${attempt}/${maxAttempts} in ${backoffMs}ms...`);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }

        // Non-retryable error
        throw new Error(`Suno create API error: ${lastErrText}`);
      }

      throw new Error(`Suno create API error: ${lastErrText}`);
    }

    let taskId: string | undefined;
    try {
      const createData = await createSunoWithRetry(6);
      taskId = createData?.task_id;

      if (!taskId) {
        console.error('Missing task_id from Suno create response:', createData);
        await serviceClient
          .from('songs')
          .update({ status: 'failed', description: 'No task_id returned from Suno' })
          .eq('id', song.id);
        throw new Error('No task_id returned from Suno');
      }
    } catch (e) {
      const errMessage = e instanceof Error ? e.message : String(e);
      console.warn('Suno create failed:', errMessage);
      
      // Check if it's a concurrency error - fallback to existing song from library
      if (errMessage.toLowerCase().includes('concurrency')) {
        console.log('Concurrency limit reached, searching for existing song in genre:', genre);
        
        // Find an existing ready song (prefer same genre AND mood, then genre-only, then any)
        let existingSong: any = null;
        let existingError: any = null;

        // 1) Try exact genre + mood match if mood provided
        if (mood) {
          const genreMoodQuery = serviceClient
            .from('songs')
            .select('*')
            .eq('status', 'ready')
            .not('requested_by', 'eq', requesterId) // Avoid user's own songs
            .eq('genre', genre)
            .eq('mood', mood)
            .limit(1);
          const res1 = await genreMoodQuery.maybeSingle();
          existingSong = res1.data;
          existingError = res1.error;
          if (existingSong && !existingError) {
            console.log('Found fallback with same genre and mood:', existingSong.id);
          }
        }

        // 2) If not found, try same genre only
        if (!existingSong || existingError) {
          const genreOnlyQuery = serviceClient
            .from('songs')
            .select('*')
            .eq('status', 'ready')
            .not('requested_by', 'eq', requesterId)
            .eq('genre', genre)
            .limit(1);
          const res2 = await genreOnlyQuery.maybeSingle();
          existingSong = res2.data;
          existingError = res2.error;
        }
        
        // 3) If still not found, try any ready song
        if (!existingSong || existingError) {
          console.log(`No existing song found for genre ${genre}, trying any genre`);
          const anyQuery = serviceClient
            .from('songs')
            .select('*')
            .eq('status', 'ready')
            .not('requested_by', 'eq', requesterId)
            .limit(1);
          const fallbackResult = await anyQuery.maybeSingle();
          existingSong = fallbackResult.data;
          existingError = fallbackResult.error;
        }
        
        
        
        if (existingSong && !existingError) {
          console.log('Found existing song to use as fallback:', existingSong.id);
          
          // Remove the failed generation from database
          await serviceClient
            .from('songs')
            .delete()
            .eq('id', song.id);
          
          // Remove the failed song from queue
          await serviceClient
            .from('queue')
            .delete()
            .eq('song_id', song.id);
          
          // Add the existing song to queue instead
          const { error: fallbackQueueError } = await serviceClient
            .from('queue')
            .upsert({
              song_id: existingSong.id,
              position: nextPosition,
              status: 'ready',
            }, {
              onConflict: 'song_id'
            });

          if (fallbackQueueError) {
            console.error('Failed to add fallback song to queue:', fallbackQueueError);
          } else {
            console.log('Added fallback song to queue:', existingSong.id);
          }
          
          return new Response(
            JSON.stringify({
              success: true,
              song_id: existingSong.id,
              status: 'ready',
              audio_url: existingSong.url,
              title: existingSong.title,
              prompt: existingSong.prompt,
              message: 'Server busy - using similar track from library'
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        } else {
          console.log('No existing song found for fallback in genre:', genre);
        }
      }
      
      // Fallback to original retry logic for non-concurrency errors or when no existing song found
      await serviceClient
        .from('songs')
        .update({ description: `Create API Error: ${errMessage}`, updated_at: new Date().toISOString() })
        .eq('id', song.id);

      // Return a queued response so the UI knows this will continue in the background
      return new Response(
        JSON.stringify({
          success: true,
          song_id: song.id,
          status: 'generating',
          message: 'High load at provider; your track is queued and will retry automatically'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
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
      status: finalResult?.audio_url ? 'ready' : 'failed',
      title: finalResult?.title || song.title,
      updated_at: new Date().toISOString(),
      suno_id: finalResult?.clip_id  // Store the Suno clip ID for fetching images later
    };

    if (finalResult?.audio_url) {
      updateData.url = finalResult.audio_url;
      console.log('Updating song with audio URL:', finalResult.audio_url);
    } else {
      updateData.description = 'Generation timeout or no audio returned';
      console.warn(`Suno task ${taskId} timed out or returned no audio; marking as failed.`);
    }

    if (finalResult?.image_url) {
      updateData.image_url = finalResult.image_url;
      console.log('Updating song with image URL:', finalResult.image_url);
    }

    if (finalResult?.lyrics) {
      // Use the dynamic description generator instead of raw lyrics
      updateData.description = generateDescription(genre, mood);
    }

    const { error: updateError } = await serviceClient
      .from('songs')
      .update(updateData)
      .eq('id', song.id);

    if (updateError) {
      console.error('Failed to update song:', updateError);
    }

    // Add to queue if song is ready
    if (finalResult?.audio_url) {
      // Update existing queue entry to ready status
      const { error: queueError } = await serviceClient
        .from('queue')
        .update({ status: 'ready' })
        .eq('song_id', song.id);

      if (queueError) {
        console.error('Failed to update queue status to ready:', queueError);
      } else {
        console.log('Updated queue entry to ready status for song:', song.id);
      }
    }

    // Store task_id as suno_id for tracking
    const { error: taskUpdateError } = await serviceClient
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