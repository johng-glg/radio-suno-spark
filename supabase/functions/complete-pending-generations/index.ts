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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    console.log('Checking for pending song generations...');

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

    // 1) Attempt to create Suno tasks for songs missing suno_id first
    {
      const { data: toCreateSongs } = await supabaseClient
        .from('songs')
        .select('id, prompt, title, genre, mood, created_at')
        .eq('status', 'generating')
        .is('suno_id', null)
        .order('created_at', { ascending: true })
        .limit(10);

      if (toCreateSongs && toCreateSongs.length > 0) {
        console.log(`Found ${toCreateSongs.length} songs without task_id. Attempting background create...`);

        for (const song of toCreateSongs) {
          try {
            const createPayload: Record<string, unknown> = {
              custom_mode: false,
              gpt_description_prompt: song.prompt,
              make_instrumental: false,
              mv: 'chirp-v5',
            };
            if (song.title) createPayload.title = song.title;
            if (song.genre) createPayload.tags = song.genre;

            let taskId: string | undefined = undefined;
            let lastErrText = '';
            for (let attempt = 1; attempt <= 6; attempt++) {
              const resp = await fetch('https://api.sunoapi.com/api/v1/suno/create', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${sunoApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(createPayload),
              });

              if (resp.ok) {
                const c = await resp.json();
                taskId = c?.task_id;
                break;
              }

              const errText = await resp.text();
              lastErrText = errText;
              if (resp.status === 429 && errText.toLowerCase().includes('concurrency')) {
                const jitter = Math.floor(Math.random() * 500);
                const backoffMs = Math.min(30000, 1000 * Math.pow(2, attempt - 1)) + jitter;
                console.log(`Concurrency (background) for song ${song.id}. Retry ${attempt}/6 in ${backoffMs}ms...`);
                await new Promise(r => setTimeout(r, backoffMs));
                continue;
              } else {
                console.error('Create error (non-retryable) for song', song.id, errText);
                break;
              }
            }

            if (taskId) {
              await supabaseClient
                .from('songs')
                .update({ suno_id: taskId, updated_at: new Date().toISOString() })
                .eq('id', song.id);
              console.log(`Assigned task_id ${taskId} to song ${song.id}`);
            } else {
              await supabaseClient
                .from('songs')
                .update({ description: `Create API Error (queued): ${lastErrText}`, updated_at: new Date().toISOString() })
                .eq('id', song.id);
            }
          } catch (error) {
            console.error('Background create error for song', song.id, error);
          }

          // Small spacing between requests
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      }
    }

    // 2) Now fetch songs that are generating and have a task id
    const { data: pendingSongs, error: fetchError } = await supabaseClient
      .from('songs')
      .select('id, suno_id, title, genre, mood, created_at')
      .eq('status', 'generating')
      .not('suno_id', 'is', null);

    if (fetchError) {
      console.error('Error fetching pending songs:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!pendingSongs || pendingSongs.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No pending generations found after create attempt',
          completed_count: 0
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`Found ${pendingSongs.length} pending generations`);

    let completedCount = 0;

    // Process each pending song
    for (const song of pendingSongs) {
      try {
        console.log(`Checking status of task: ${song.suno_id} for song: ${song.title}`);

        // Check if song is too old (more than 10 minutes)
        const songAge = Date.now() - new Date(song.created_at).getTime();
        if (songAge > 10 * 60 * 1000) {
          console.log(`Song ${song.id} is too old (${Math.round(songAge / 60000)} minutes), marking as failed`);
          
          await supabaseClient
            .from('songs')
            .update({ 
              status: 'failed',
              description: 'Generation timed out'
            })
            .eq('id', song.id);
            
          continue;
        }

        // Check task status with Suno API
        const taskResp = await fetch(`https://api.sunoapi.com/api/v1/suno/task/${song.suno_id}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${sunoApiKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (!taskResp.ok) {
          console.error(`Failed to check task ${song.suno_id}:`, taskResp.statusText);
          continue;
        }

        const taskData = await taskResp.json();
        
        if (taskData.code === 200 && Array.isArray(taskData.data) && taskData.data.length > 0) {
          // Look for completed clips
          const succeededItem = taskData.data.find((item: any) => item.state === 'succeeded' && item.audio_url);
          
          if (succeededItem) {
            console.log(`Task ${song.suno_id} completed successfully`);
            
            // Update song with results
            const updateData: any = {
              status: 'ready',
              title: succeededItem.title || song.title,
              url: succeededItem.audio_url,
              updated_at: new Date().toISOString()
            };

            if (succeededItem.image_url) {
              updateData.image_url = succeededItem.image_url;
            }

            // Generate description from tags
            if (succeededItem.lyrics && succeededItem.tags) {
              const moodText = succeededItem.tags.includes('peaceful') ? 'peaceful' :
                            succeededItem.tags.includes('energetic') ? 'energetic' :
                            succeededItem.tags.includes('dreamy') ? 'dreamy' :
                            succeededItem.tags.includes('intense') ? 'intense' : 'atmospheric';
              
              const instruments = succeededItem.tags.match(/\b(piano|guitar|violin|flute|drums|bass|saxophone|synth|electronic)\b/gi)?.slice(0, 2) || [];
              const instrumentText = instruments.length > 0 ? ` featuring ${instruments.join(' and ')}` : '';
              
              updateData.description = `A ${moodText} ${song.genre} composition${instrumentText} with unique musical elements`;
            }

            const { error: updateError } = await supabaseClient
              .from('songs')
              .update(updateData)
              .eq('id', song.id);

            if (updateError) {
              console.error(`Failed to update song ${song.id}:`, updateError);
            } else {
              console.log(`Successfully completed song: ${song.title}`);
              completedCount++;

              // Check if song was requested by a user and add to their queue
              const { data: songData } = await supabaseClient
                .from('songs')
                .select('requested_by')
                .eq('id', song.id)
                .single();

              if (songData?.requested_by) {
                const { data: existingQueueItem } = await supabaseClient
                  .from('queue')
                  .select('id')
                  .eq('song_id', song.id)
                  .eq('user_id', songData.requested_by)
                  .maybeSingle();

                if (!existingQueueItem) {
                  const { data: maxPositionData } = await supabaseClient
                    .from('queue')
                    .select('position')
                    .eq('user_id', songData.requested_by)
                    .order('position', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                  const nextPosition = (maxPositionData?.position || 0) + 1;

                  await supabaseClient.from('queue').insert({
                    song_id: song.id,
                    user_id: songData.requested_by,
                    position: nextPosition,
                    status: 'queued',
                  });

                  console.log(`Added completed song to user ${songData.requested_by}'s queue at position: ${nextPosition}`);
                }
              }
            }
          } else {
            // Check if any items failed
            const failedItem = taskData.data.find((item: any) => item.state === 'failed');
            if (failedItem) {
              console.log(`Task ${song.suno_id} failed`);
              
              await supabaseClient
                .from('songs')
                .update({ 
                  status: 'failed',
                  description: 'Generation failed on Suno API'
                })
                .eq('id', song.id);
            } else {
              console.log(`Task ${song.suno_id} still in progress`);
            }
          }
        }
      } catch (error) {
        console.error(`Error processing song ${song.id}:`, error);
      }

      // Small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`Completed processing. ${completedCount} songs finished successfully.`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${pendingSongs.length} pending generations, ${completedCount} completed`,
        completed_count: completedCount
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