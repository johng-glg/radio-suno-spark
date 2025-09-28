import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BuildPromptRequest {
  user_id?: string;
  wild_card_mode?: boolean;
  exclude_last_selections?: boolean;
  genre?: string;
  mood?: string;
}

interface WordPool {
  id: string;
  type: string;
  value: string;
  weight: number;
}

interface PromptTemplate {
  id: string;
  template: string;
}

interface UserPreferences {
  excluded_moods: string[];
  excluded_instruments: string[];
  wild_card_mode: boolean;
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

    const { user_id, wild_card_mode = false, exclude_last_selections = false, genre, mood } = await req.json() as BuildPromptRequest;

    console.log('Building prompt with params:', { user_id, wild_card_mode, exclude_last_selections, genre, mood });

    // Get user preferences if user_id is provided
    let userPreferences: UserPreferences = {
      excluded_moods: [],
      excluded_instruments: [],
      wild_card_mode: false
    };

    if (user_id) {
      const { data: preferences } = await supabaseClient
        .from('user_preferences')
        .select('excluded_moods, excluded_instruments, wild_card_mode')
        .eq('user_id', user_id)
        .single();

      if (preferences) {
        userPreferences = preferences;
      }
    }

    // Use wild_card_mode from request or user preferences
    const useWildCard = wild_card_mode || userPreferences.wild_card_mode;

    // Get a random prompt template
    const { data: templates, error: templateError } = await supabaseClient
      .from('prompt_templates')
      .select('*');

    if (templateError || !templates || templates.length === 0) {
      throw new Error('No prompt templates available');
    }

    const randomTemplate = templates[Math.floor(Math.random() * templates.length)] as PromptTemplate;
    console.log('Selected template:', randomTemplate.template);

    // Find all placeholders in the template
    const placeholders = randomTemplate.template.match(/\{(\w+)\}/g) || [];
    const uniquePlaceholders = [...new Set(placeholders.map(p => p.replace(/[{}]/g, '')))];

    console.log('Found placeholders:', uniquePlaceholders);

    let builtPrompt = randomTemplate.template;
    const selectedWords: Record<string, string> = {};

    // Replace each placeholder with a random word from word_pools
    for (const placeholder of uniquePlaceholders) {
      // If we have a specific value provided, use that instead of random selection
      if (placeholder === 'genre' && genre) {
        selectedWords[placeholder] = genre.toLowerCase();
        builtPrompt = builtPrompt.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), genre.toLowerCase());
        continue;
      }
      
      // If no genre is specified and this is a genre placeholder, select a random genre
      if (placeholder === 'genre' && !genre) {
        // Get available genres from word_pools
        const { data: genreWords } = await supabaseClient
          .from('word_pools')
          .select('*')
          .eq('type', 'genre');

        if (genreWords && genreWords.length > 0) {
          const randomGenre = genreWords[Math.floor(Math.random() * genreWords.length)];
          selectedWords[placeholder] = randomGenre.value;
          builtPrompt = builtPrompt.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), randomGenre.value);
        } else {
          // Fallback to a default genre if no genre words are available
          selectedWords[placeholder] = 'electronic';
          builtPrompt = builtPrompt.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), 'electronic');
        }
        continue;
      }
      
      if (placeholder === 'mood' && mood) {
        selectedWords[placeholder] = mood.toLowerCase();
        builtPrompt = builtPrompt.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), mood.toLowerCase());
        continue;
      }

      let query = supabaseClient
        .from('word_pools')
        .select('*')
        .eq('type', placeholder);

      // Apply exclusions based on user preferences
      if (placeholder === 'mood' && userPreferences.excluded_moods.length > 0) {
        query = query.not('value', 'in', `(${userPreferences.excluded_moods.map(m => `"${m}"`).join(',')})`);
      }
      if (placeholder === 'instrument' && userPreferences.excluded_instruments.length > 0) {
        query = query.not('value', 'in', `(${userPreferences.excluded_instruments.map(i => `"${i}"`).join(',')})`);
      }

      const { data: words, error: wordError } = await query;

      if (wordError || !words || words.length === 0) {
        console.warn(`No words found for placeholder: ${placeholder}`);
        continue;
      }

      // Weighted random selection
      const totalWeight = words.reduce((sum: number, word: WordPool) => sum + word.weight, 0);
      let randomWeight = Math.random() * totalWeight;
      
      let selectedWord = words[0];
      for (const word of words) {
        randomWeight -= word.weight;
        if (randomWeight <= 0) {
          selectedWord = word;
          break;
        }
      }

      selectedWords[placeholder] = selectedWord.value;
      builtPrompt = builtPrompt.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), selectedWord.value);
    }

    // Add wild card twist if enabled (30% chance)
    if (useWildCard && Math.random() < 0.3) {
      const { data: twistWords } = await supabaseClient
        .from('word_pools')
        .select('*')
        .eq('type', 'twist');

      if (twistWords && twistWords.length > 0) {
        const randomTwist = twistWords[Math.floor(Math.random() * twistWords.length)] as WordPool;
        builtPrompt += ` ${randomTwist.value}`;
        selectedWords['twist'] = randomTwist.value;
        console.log('Added wild card twist:', randomTwist.value);
      }
    }

    console.log('Built prompt:', builtPrompt);
    console.log('Selected words:', selectedWords);

    return new Response(JSON.stringify({
      success: true,
      prompt: builtPrompt,
      template_used: randomTemplate.template,
      selected_words: selectedWords,
      wild_card_applied: selectedWords.twist !== undefined
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in build-prompt function:', error);
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