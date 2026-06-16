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
  public: {
    Tables: {
      app_settings: {
        Row: {
          auto_execute: boolean
          environment: string
          id: number
          live_confirmed: boolean
          max_daily_loss_pct: number
          max_risk_per_trade_pct: number
          min_confidence: number
          session_end_est: string
          session_start_est: string
          updated_at: string
        }
        Insert: {
          auto_execute?: boolean
          environment?: string
          id?: number
          live_confirmed?: boolean
          max_daily_loss_pct?: number
          max_risk_per_trade_pct?: number
          min_confidence?: number
          session_end_est?: string
          session_start_est?: string
          updated_at?: string
        }
        Update: {
          auto_execute?: boolean
          environment?: string
          id?: number
          live_confirmed?: boolean
          max_daily_loss_pct?: number
          max_risk_per_trade_pct?: number
          min_confidence?: number
          session_end_est?: string
          session_start_est?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_pnl: {
        Row: {
          date: string
          equity_close: number | null
          equity_open: number | null
          loss_cap_hit: boolean
          positions_closed_at_eod: number | null
          realized_pnl: number
          updated_at: string
        }
        Insert: {
          date: string
          equity_close?: number | null
          equity_open?: number | null
          loss_cap_hit?: boolean
          positions_closed_at_eod?: number | null
          realized_pnl?: number
          updated_at?: string
        }
        Update: {
          date?: string
          equity_close?: number | null
          equity_open?: number | null
          loss_cap_hit?: boolean
          positions_closed_at_eod?: number | null
          realized_pnl?: number
          updated_at?: string
        }
        Relationships: []
      }
      instruments: {
        Row: {
          created_at: string
          enabled: boolean
          epic: string
          id: string
          min_stop_distance_points: number
          name: string
          tick_value_per_point: number
          type: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          epic: string
          id?: string
          min_stop_distance_points: number
          name: string
          tick_value_per_point?: number
          type: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          epic?: string
          id?: string
          min_stop_distance_points?: number
          name?: string
          tick_value_per_point?: number
          type?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          close_level: number | null
          closed_at: string | null
          created_at: string
          deal_id: string | null
          deal_reference: string | null
          direction: string
          epic: string
          fill_level: number | null
          id: string
          raw: Json | null
          realized_pnl: number | null
          signal_id: string | null
          size: number
          status: string
          stop_loss: number | null
          take_profit: number | null
        }
        Insert: {
          close_level?: number | null
          closed_at?: string | null
          created_at?: string
          deal_id?: string | null
          deal_reference?: string | null
          direction: string
          epic: string
          fill_level?: number | null
          id?: string
          raw?: Json | null
          realized_pnl?: number | null
          signal_id?: string | null
          size: number
          status?: string
          stop_loss?: number | null
          take_profit?: number | null
        }
        Update: {
          close_level?: number | null
          closed_at?: string | null
          created_at?: string
          deal_id?: string | null
          deal_reference?: string | null
          direction?: string
          epic?: string
          fill_level?: number | null
          id?: string
          raw?: Json | null
          realized_pnl?: number | null
          signal_id?: string | null
          size?: number
          status?: string
          stop_loss?: number | null
          take_profit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      signals: {
        Row: {
          confidence: number | null
          created_at: string
          direction: string
          entry_price: number | null
          epic: string
          id: string
          justification: string | null
          name: string | null
          raw: Json | null
          status: string
          stop_loss: number | null
          take_profit: number | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          direction: string
          entry_price?: number | null
          epic: string
          id?: string
          justification?: string | null
          name?: string | null
          raw?: Json | null
          status?: string
          stop_loss?: number | null
          take_profit?: number | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          direction?: string
          entry_price?: number | null
          epic?: string
          id?: string
          justification?: string | null
          name?: string | null
          raw?: Json | null
          status?: string
          stop_loss?: number | null
          take_profit?: number | null
        }
        Relationships: []
      }
      trade_log: {
        Row: {
          created_at: string
          data: Json | null
          id: number
          kind: string
          message: string | null
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: number
          kind: string
          message?: string | null
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: number
          kind?: string
          message?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
