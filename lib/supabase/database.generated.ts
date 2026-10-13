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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      brix_generations: {
        Row: {
          aspect: number
          connection_id: string
          created_at: string
          error: string | null
          error_kind: string | null
          finalize_lease_token: string | null
          finalize_lease_until: string | null
          finished_at: string | null
          id: string
          input_media: Json
          model_id: string
          model_label: string
          model_path: string
          outputs: Json
          preset_id: string | null
          project_id: string | null
          prompt: string
          provider_cost_estimate: number | null
          provider_request_id: string | null
          settings: Json
          status: string
          submit_key: string
          surface: string
          updated_at: string
          user_id: string
        }
        Insert: {
          aspect?: number
          connection_id: string
          created_at?: string
          error?: string | null
          error_kind?: string | null
          finalize_lease_token?: string | null
          finalize_lease_until?: string | null
          finished_at?: string | null
          id?: string
          input_media?: Json
          model_id: string
          model_label: string
          model_path: string
          outputs?: Json
          preset_id?: string | null
          project_id?: string | null
          prompt?: string
          provider_cost_estimate?: number | null
          provider_request_id?: string | null
          settings?: Json
          status?: string
          submit_key: string
          surface: string
          updated_at?: string
          user_id: string
        }
        Update: {
          aspect?: number
          connection_id?: string
          created_at?: string
          error?: string | null
          error_kind?: string | null
          finalize_lease_token?: string | null
          finalize_lease_until?: string | null
          finished_at?: string | null
          id?: string
          input_media?: Json
          model_id?: string
          model_label?: string
          model_path?: string
          outputs?: Json
          preset_id?: string | null
          project_id?: string | null
          prompt?: string
          provider_cost_estimate?: number | null
          provider_request_id?: string | null
          settings?: Json
          status?: string
          submit_key?: string
          surface?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brix_generations_project_id_user_id_fkey"
            columns: ["project_id", "user_id"]
            isOneToOne: false
            referencedRelation: "brix_projects"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "brix_generations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "brix_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brix_presets: {
        Row: {
          active: boolean
          data: Json
          id: string
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          data: Json
          id?: string
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          data?: Json
          id?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      brix_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          role?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          role?: string
        }
        Relationships: []
      }
      brix_projects: {
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
        Relationships: [
          {
            foreignKeyName: "brix_projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "brix_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brix_templates: {
        Row: {
          active: boolean
          category: string
          cover_path: string | null
          cover_video_url: string | null
          created_at: string
          description: string
          id: string
          model_id: string
          owner_id: string | null
          prompt: string
          settings: Json
          sort_order: number
          surface: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          cover_path?: string | null
          cover_video_url?: string | null
          created_at?: string
          description?: string
          id?: string
          model_id: string
          owner_id?: string | null
          prompt?: string
          settings?: Json
          sort_order?: number
          surface: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          cover_path?: string | null
          cover_video_url?: string | null
          created_at?: string
          description?: string
          id?: string
          model_id?: string
          owner_id?: string | null
          prompt?: string
          settings?: Json
          sort_order?: number
          surface?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brix_templates_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "brix_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brix_uploads: {
        Row: {
          bytes: number
          content_type: string
          created_at: string
          id: string
          kind: string
          metadata: Json
          name: string
          storage_path: string
          user_id: string
        }
        Insert: {
          bytes: number
          content_type: string
          created_at?: string
          id?: string
          kind: string
          metadata?: Json
          name: string
          storage_path: string
          user_id: string
        }
        Update: {
          bytes?: number
          content_type?: string
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          name?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brix_uploads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "brix_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      brix_claim_generation: {
        Args: { target_generation_id: string }
        Returns: {
          aspect: number
          connection_id: string
          created_at: string
          error: string | null
          error_kind: string | null
          finalize_lease_token: string | null
          finalize_lease_until: string | null
          finished_at: string | null
          id: string
          input_media: Json
          model_id: string
          model_label: string
          model_path: string
          outputs: Json
          preset_id: string | null
          project_id: string | null
          prompt: string
          provider_cost_estimate: number | null
          provider_request_id: string | null
          settings: Json
          status: string
          submit_key: string
          surface: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "brix_generations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      brix_connection_status: {
        Args: never
        Returns: {
          created_at: string
          key_label: string
        }[]
      }
      brix_disconnect_connection: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      brix_get_connection: {
        Args: { target_connection_id?: string; target_user_id: string }
        Returns: {
          encrypted_credentials: string
          id: string
        }[]
      }
      brix_put_connection: {
        Args: {
          ciphertext: string
          masked_label: string
          target_user_id: string
        }
        Returns: string
      }
      brix_rate_limit: {
        Args: {
          period_seconds: number
          request_limit: number
          target_key: string
        }
        Returns: boolean
      }
      brix_start_generation: {
        Args: {
          job: Json
          request_body: Json
          target_connection_id: string
          target_user_id: string
        }
        Returns: Json
      }
      brix_user_connection_status: {
        Args: { target_user_id: string }
        Returns: {
          created_at: string
          key_label: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
