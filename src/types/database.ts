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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      metric_entries: {
        Row: {
          created_at: string
          id: string
          logged_at: string
          logged_on: string
          metric_id: string
          note: string | null
          occurrence: number
          source: Database["public"]["Enums"]["entry_source"]
          updated_at: string
          user_id: string
          value_bool: boolean | null
          value_num: number | null
          value_text: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          logged_at?: string
          logged_on?: string
          metric_id: string
          note?: string | null
          occurrence?: number
          source?: Database["public"]["Enums"]["entry_source"]
          updated_at?: string
          user_id?: string
          value_bool?: boolean | null
          value_num?: number | null
          value_text?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          logged_at?: string
          logged_on?: string
          metric_id?: string
          note?: string | null
          occurrence?: number
          source?: Database["public"]["Enums"]["entry_source"]
          updated_at?: string
          user_id?: string
          value_bool?: boolean | null
          value_num?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metric_entries_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      metrics: {
        Row: {
          archived_at: string | null
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["metric_kind"]
          label: string
          scale_max: number | null
          scale_min: number | null
          slug: string
          sort_order: number
          target_value: number | null
          unit: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          category: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["metric_kind"]
          label: string
          scale_max?: number | null
          scale_min?: number | null
          slug: string
          sort_order?: number
          target_value?: number | null
          unit?: string | null
          user_id?: string
        }
        Update: {
          archived_at?: string | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["metric_kind"]
          label?: string
          scale_max?: number | null
          scale_min?: number | null
          slug?: string
          sort_order?: number
          target_value?: number | null
          unit?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "metrics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          timezone: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          timezone?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          timezone?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_daily_summary: {
        Row: {
          day: string | null
          habits_done: number | null
          habits_total: number | null
          morning_readiness: number | null
          sleep_quality: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metric_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      entry_source: "dashboard" | "device" | "import" | "ocr" | "agent"
      erg_piece_type:
        | "ut2"
        | "at_interval"
        | "steady"
        | "test"
        | "warmup"
        | "other"
      experiment_status: "planned" | "running" | "completed" | "abandoned"
      lift_set_type: "working" | "warmup" | "dropset" | "failure" | "amrap"
      metric_kind: "boolean" | "scale" | "numeric" | "duration" | "text"
      note_kind: "observation" | "hypothesis" | "recommendation" | "nudge"
      note_status: "new" | "acknowledged" | "acted" | "dismissed"
      session_status: "planned" | "in_progress" | "completed" | "skipped"
      todo_status: "open" | "done" | "dropped"
      upload_kind: "strong_screenshot" | "erg_monitor" | "other"
      upload_status:
        | "pending"
        | "processing"
        | "parsed"
        | "confirmed"
        | "failed"
        | "ignored"
      workout_modality:
        | "erg"
        | "lift"
        | "run"
        | "bike"
        | "swim"
        | "mobility"
        | "other"
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      entry_source: ["dashboard", "device", "import", "ocr", "agent"],
      erg_piece_type: [
        "ut2",
        "at_interval",
        "steady",
        "test",
        "warmup",
        "other",
      ],
      experiment_status: ["planned", "running", "completed", "abandoned"],
      lift_set_type: ["working", "warmup", "dropset", "failure", "amrap"],
      metric_kind: ["boolean", "scale", "numeric", "duration", "text"],
      note_kind: ["observation", "hypothesis", "recommendation", "nudge"],
      note_status: ["new", "acknowledged", "acted", "dismissed"],
      session_status: ["planned", "in_progress", "completed", "skipped"],
      todo_status: ["open", "done", "dropped"],
      upload_kind: ["strong_screenshot", "erg_monitor", "other"],
      upload_status: [
        "pending",
        "processing",
        "parsed",
        "confirmed",
        "failed",
        "ignored",
      ],
      workout_modality: [
        "erg",
        "lift",
        "run",
        "bike",
        "swim",
        "mobility",
        "other",
      ],
    },
  },
} as const
