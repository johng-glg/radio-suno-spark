export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      auth_rate_limits: {
        Row: {
          attempt_count: number | null
          blocked_until: string | null
          created_at: string | null
          id: string
          ip_address: unknown
          last_attempt: string | null
        }
        Insert: {
          attempt_count?: number | null
          blocked_until?: string | null
          created_at?: string | null
          id?: string
          ip_address: unknown
          last_attempt?: string | null
        }
        Update: {
          attempt_count?: number | null
          blocked_until?: string | null
          created_at?: string | null
          id?: string
          ip_address?: unknown
          last_attempt?: string | null
        }
        Relationships: []
      }
      playlist_songs: {
        Row: {
          added_at: string
          id: string
          playlist_id: string
          position: number
          song_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          playlist_id: string
          position?: number
          song_id: string
        }
        Update: {
          added_at?: string
          id?: string
          playlist_id?: string
          position?: number
          song_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_songs_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_songs_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          favorite_genres: string[] | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          favorite_genres?: string[] | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          favorite_genres?: string[] | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      prompt_pools: {
        Row: {
          created_at: string
          id: string
          type: string
          value: string
          weight: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          type: string
          value: string
          weight?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          type?: string
          value?: string
          weight?: number | null
        }
        Relationships: []
      }
      prompt_templates: {
        Row: {
          created_at: string
          id: string
          template: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          template: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          template?: string
          updated_at?: string
        }
        Relationships: []
      }
      queue: {
        Row: {
          created_at: string
          id: string
          position: number
          song_id: string
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          position: number
          song_id: string
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          song_id?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "queue_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: true
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      songs: {
        Row: {
          commissioned_by: string | null
          created_at: string
          description: string | null
          genre: string
          holiday: string | null
          id: string
          image_url: string | null
          is_public: boolean | null
          mood: string | null
          original_song_id: string | null
          prompt: string
          requested_by: string | null
          resubmission_succeeded_at: string | null
          resubmitted_at: string | null
          station_id: string | null
          status: string
          suno_id: string | null
          title: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          commissioned_by?: string | null
          created_at?: string
          description?: string | null
          genre: string
          holiday?: string | null
          id?: string
          image_url?: string | null
          is_public?: boolean | null
          mood?: string | null
          original_song_id?: string | null
          prompt: string
          requested_by?: string | null
          resubmission_succeeded_at?: string | null
          resubmitted_at?: string | null
          station_id?: string | null
          status?: string
          suno_id?: string | null
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          commissioned_by?: string | null
          created_at?: string
          description?: string | null
          genre?: string
          holiday?: string | null
          id?: string
          image_url?: string | null
          is_public?: boolean | null
          mood?: string | null
          original_song_id?: string | null
          prompt?: string
          requested_by?: string | null
          resubmission_succeeded_at?: string | null
          resubmitted_at?: string | null
          station_id?: string | null
          status?: string
          suno_id?: string | null
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "songs_original_song_id_fkey"
            columns: ["original_song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      station_plays: {
        Row: {
          created_at: string
          id: string
          signal: string
          song_id: string
          station_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          signal: string
          song_id: string
          station_id: string
        }
        Update: {
          created_at?: string
          id?: string
          signal?: string
          song_id?: string
          station_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_plays_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_plays_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          created_at: string
          genres: string[]
          holiday: string | null
          id: string
          instrumental: boolean
          last_tuned_at: string | null
          mood: string | null
          name: string
          taste: Json
          updated_at: string
          user_id: string
          wildcard: boolean
        }
        Insert: {
          created_at?: string
          genres?: string[]
          holiday?: string | null
          id?: string
          instrumental?: boolean
          last_tuned_at?: string | null
          mood?: string | null
          name?: string
          taste?: Json
          updated_at?: string
          user_id: string
          wildcard?: boolean
        }
        Update: {
          created_at?: string
          genres?: string[]
          holiday?: string | null
          id?: string
          instrumental?: boolean
          last_tuned_at?: string | null
          mood?: string | null
          name?: string
          taste?: Json
          updated_at?: string
          user_id?: string
          wildcard?: boolean
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          excluded_instruments: string[] | null
          excluded_moods: string[] | null
          generate_when_exhausted: boolean | null
          id: string
          updated_at: string
          user_id: string | null
          wild_card_mode: boolean | null
        }
        Insert: {
          created_at?: string
          excluded_instruments?: string[] | null
          excluded_moods?: string[] | null
          generate_when_exhausted?: boolean | null
          id?: string
          updated_at?: string
          user_id?: string | null
          wild_card_mode?: boolean | null
        }
        Update: {
          created_at?: string
          excluded_instruments?: string[] | null
          excluded_moods?: string[] | null
          generate_when_exhausted?: boolean | null
          id?: string
          updated_at?: string
          user_id?: string | null
          wild_card_mode?: boolean | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_song_interactions: {
        Row: {
          created_at: string
          id: string
          interaction_type: string
          song_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          interaction_type: string
          song_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          interaction_type?: string
          song_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_song_interactions_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_song_plays: {
        Row: {
          created_at: string
          first_played_at: string
          id: string
          last_played_at: string
          play_count: number
          song_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          first_played_at?: string
          id?: string
          last_played_at?: string
          play_count?: number
          song_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          first_played_at?: string
          id?: string
          last_played_at?: string
          play_count?: number
          song_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      word_pools: {
        Row: {
          created_at: string
          id: string
          type: string
          value: string
          weight: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          type: string
          value: string
          weight?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          type?: string
          value?: string
          weight?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      commission_track: { Args: { p_station: string }; Returns: string }
      get_admin_stats: { Args: never; Returns: Json }
      get_current_user_email: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      library_genres: {
        Args: never
        Returns: {
          genre: string
          n: number
        }[]
      }
      next_track: {
        Args: {
          p_exclude?: string[]
          p_genres?: string[]
          p_mood?: string
          p_station?: string
        }
        Returns: {
          commissioned_by: string | null
          created_at: string
          description: string | null
          genre: string
          holiday: string | null
          id: string
          image_url: string | null
          is_public: boolean | null
          mood: string | null
          original_song_id: string | null
          prompt: string
          requested_by: string | null
          resubmission_succeeded_at: string | null
          resubmitted_at: string | null
          station_id: string | null
          status: string
          suno_id: string | null
          title: string | null
          updated_at: string
          url: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "songs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      record_feedback: {
        Args: { p_signal: string; p_song: string; p_station: string }
        Returns: Json
      }
      seed_premade_songs: { Args: never; Returns: undefined }
      system_update_song: {
        Args: { song_id: string; update_data: Json }
        Returns: boolean
      }
      track_song_play: {
        Args: { _song_id: string; _user_id?: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
