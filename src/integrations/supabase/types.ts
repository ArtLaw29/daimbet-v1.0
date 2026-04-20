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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_emails_log: {
        Row: {
          body_preview: string | null
          id: string
          recipients_json: Json
          sent_at: string
          status: string
          subject: string
        }
        Insert: {
          body_preview?: string | null
          id?: string
          recipients_json: Json
          sent_at?: string
          status?: string
          subject: string
        }
        Update: {
          body_preview?: string | null
          id?: string
          recipients_json?: Json
          sent_at?: string
          status?: string
          subject?: string
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          is_read: boolean
          reference_id: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          is_read?: boolean
          reference_id?: string | null
          title: string
          type: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          is_read?: boolean
          reference_id?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      banned_words: {
        Row: {
          created_at: string
          id: string
          word: string
        }
        Insert: {
          created_at?: string
          id?: string
          word: string
        }
        Update: {
          created_at?: string
          id?: string
          word?: string
        }
        Relationships: []
      }
      bet_options: {
        Row: {
          bet_id: string
          bornes_info: string | null
          cote_actuelle: number
          id: string
          is_winner: boolean | null
          label: string
          total_mises_dc: number
        }
        Insert: {
          bet_id: string
          bornes_info?: string | null
          cote_actuelle?: number
          id?: string
          is_winner?: boolean | null
          label: string
          total_mises_dc?: number
        }
        Update: {
          bet_id?: string
          bornes_info?: string | null
          cote_actuelle?: number
          id?: string
          is_winner?: boolean | null
          label?: string
          total_mises_dc?: number
        }
        Relationships: [
          {
            foreignKeyName: "bet_options_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: false
            referencedRelation: "bets"
            referencedColumns: ["id"]
          },
        ]
      }
      bets: {
        Row: {
          category: Database["public"]["Enums"]["bet_category"]
          close_date: string | null
          created_at: string
          created_by: string | null
          description: string | null
          emoji: string | null
          end_date: string
          id: string
          is_long_terme: boolean
          max_winners: number
          mise_max_pct: number
          open_to_suggestions: boolean
          resolution_mode: Database["public"]["Enums"]["resolution_mode"]
          status: Database["public"]["Enums"]["bet_status"]
          suppression_motif: string | null
          title: string
          type: Database["public"]["Enums"]["bet_type"]
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["bet_category"]
          close_date?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          emoji?: string | null
          end_date: string
          id?: string
          is_long_terme?: boolean
          max_winners?: number
          mise_max_pct?: number
          open_to_suggestions?: boolean
          resolution_mode?: Database["public"]["Enums"]["resolution_mode"]
          status?: Database["public"]["Enums"]["bet_status"]
          suppression_motif?: string | null
          title: string
          type?: Database["public"]["Enums"]["bet_type"]
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["bet_category"]
          close_date?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          emoji?: string | null
          end_date?: string
          id?: string
          is_long_terme?: boolean
          max_winners?: number
          mise_max_pct?: number
          open_to_suggestions?: boolean
          resolution_mode?: Database["public"]["Enums"]["resolution_mode"]
          status?: Database["public"]["Enums"]["bet_status"]
          suppression_motif?: string | null
          title?: string
          type?: Database["public"]["Enums"]["bet_type"]
          updated_at?: string
        }
        Relationships: []
      }
      daimocratie_proposals: {
        Row: {
          created_at: string
          end_date_proposed: string | null
          id: string
          options_json: Json | null
          payload: Json | null
          proposal_kind: string
          status: Database["public"]["Enums"]["proposal_status"]
          title: string
          type: string | null
          user_id: string
          votes_negative: number
          votes_positive: number
        }
        Insert: {
          created_at?: string
          end_date_proposed?: string | null
          id?: string
          options_json?: Json | null
          payload?: Json | null
          proposal_kind?: string
          status?: Database["public"]["Enums"]["proposal_status"]
          title: string
          type?: string | null
          user_id: string
          votes_negative?: number
          votes_positive?: number
        }
        Update: {
          created_at?: string
          end_date_proposed?: string | null
          id?: string
          options_json?: Json | null
          payload?: Json | null
          proposal_kind?: string
          status?: Database["public"]["Enums"]["proposal_status"]
          title?: string
          type?: string | null
          user_id?: string
          votes_negative?: number
          votes_positive?: number
        }
        Relationships: []
      }
      daimocratie_votes: {
        Row: {
          created_at: string
          id: string
          proposal_id: string
          user_id: string
          vote: string
        }
        Insert: {
          created_at?: string
          id?: string
          proposal_id: string
          user_id: string
          vote: string
        }
        Update: {
          created_at?: string
          id?: string
          proposal_id?: string
          user_id?: string
          vote?: string
        }
        Relationships: [
          {
            foreignKeyName: "daimocratie_votes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "daimocratie_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      game_participations: {
        Row: {
          created_at: string
          data: Json
          id: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_participations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      game_sessions: {
        Row: {
          closed_at: string | null
          config: Json
          created_at: string
          created_by: string | null
          game_type: Database["public"]["Enums"]["game_type"]
          id: string
          status: Database["public"]["Enums"]["game_session_status"]
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          config?: Json
          created_at?: string
          created_by?: string | null
          game_type: Database["public"]["Enums"]["game_type"]
          id?: string
          status?: Database["public"]["Enums"]["game_session_status"]
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          config?: Json
          created_at?: string
          created_by?: string | null
          game_type?: Database["public"]["Enums"]["game_type"]
          id?: string
          status?: Database["public"]["Enums"]["game_session_status"]
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      gazette_messages: {
        Row: {
          content: string
          created_at: string
          flag_reason: string | null
          flag_score: number
          flag_status: boolean
          id: string
          is_deleted: boolean
          is_system_message: boolean
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          flag_reason?: string | null
          flag_score?: number
          flag_status?: boolean
          id?: string
          is_deleted?: boolean
          is_system_message?: boolean
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          flag_reason?: string | null
          flag_score?: number
          flag_status?: boolean
          id?: string
          is_deleted?: boolean
          is_system_message?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      gazette_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gazette_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "gazette_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      kiss_marry_votes: {
        Row: {
          category: Database["public"]["Enums"]["km_category"]
          created_at: string
          id: string
          month_year: string
          voted_prenom: string
          voter_hash: string
        }
        Insert: {
          category: Database["public"]["Enums"]["km_category"]
          created_at?: string
          id?: string
          month_year: string
          voted_prenom: string
          voter_hash: string
        }
        Update: {
          category?: Database["public"]["Enums"]["km_category"]
          created_at?: string
          id?: string
          month_year?: string
          voted_prenom?: string
          voter_hash?: string
        }
        Relationships: []
      }
      km_reveal_config: {
        Row: {
          id: string
          last_reset_at: string | null
          reveal_dates: string[]
          updated_at: string
        }
        Insert: {
          id?: string
          last_reset_at?: string | null
          reveal_dates?: string[]
          updated_at?: string
        }
        Update: {
          id?: string
          last_reset_at?: string | null
          reveal_dates?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      liquidity_injections: {
        Row: {
          amount_dc: number
          id: string
          triggered_at: string
          triggered_by: string | null
        }
        Insert: {
          amount_dc?: number
          id?: string
          triggered_at?: string
          triggered_by?: string | null
        }
        Update: {
          amount_dc?: number
          id?: string
          triggered_at?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      moderation_log: {
        Row: {
          action_type: string
          actor_id: string | null
          created_at: string
          description: string
          id: string
          motif: string | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          created_at?: string
          description: string
          id?: string
          motif?: string | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          created_at?: string
          description?: string
          id?: string
          motif?: string | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      nav_config: {
        Row: {
          id: string
          is_visible: boolean
          tab_key: string
          updated_at: string
        }
        Insert: {
          id?: string
          is_visible?: boolean
          tab_key: string
          updated_at?: string
        }
        Update: {
          id?: string
          is_visible?: boolean
          tab_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          balance: number
          created_at: string
          display_name: string
          emoji: string | null
          has_accepted_charter: boolean
          id: string
          is_suspended: boolean
          rules_accepted: boolean
          rules_accepted_at: string | null
          updated_at: string
          user_id: string
          visible_in_kiss_marry: boolean
          visible_in_sondages: boolean
        }
        Insert: {
          avatar_url?: string | null
          balance?: number
          created_at?: string
          display_name?: string
          emoji?: string | null
          has_accepted_charter?: boolean
          id?: string
          is_suspended?: boolean
          rules_accepted?: boolean
          rules_accepted_at?: string | null
          updated_at?: string
          user_id: string
          visible_in_kiss_marry?: boolean
          visible_in_sondages?: boolean
        }
        Update: {
          avatar_url?: string | null
          balance?: number
          created_at?: string
          display_name?: string
          emoji?: string | null
          has_accepted_charter?: boolean
          id?: string
          is_suspended?: boolean
          rules_accepted?: boolean
          rules_accepted_at?: string | null
          updated_at?: string
          user_id?: string
          visible_in_kiss_marry?: boolean
          visible_in_sondages?: boolean
        }
        Relationships: []
      }
      public_contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          ip_address: string | null
          is_handled: boolean
          message: string
          nom: string
          subject: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          ip_address?: string | null
          is_handled?: boolean
          message: string
          nom: string
          subject: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          is_handled?: boolean
          message?: string
          nom?: string
          subject?: string
        }
        Relationships: []
      }
      retraction_config: {
        Row: {
          end_hour: number
          id: string
          start_hour: number
          updated_at: string
        }
        Insert: {
          end_hour?: number
          id?: string
          start_hour?: number
          updated_at?: string
        }
        Update: {
          end_hour?: number
          id?: string
          start_hour?: number
          updated_at?: string
        }
        Relationships: []
      }
      solde_history: {
        Row: {
          created_at: string
          delta_dc: number
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delta_dc: number
          id?: string
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          delta_dc?: number
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          sender: string
          ticket_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          sender: string
          ticket_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          sender?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          admin_replied_at: string | null
          created_at: string
          id: string
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          user_id: string
          user_last_seen_at: string | null
        }
        Insert: {
          admin_replied_at?: string | null
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          user_id: string
          user_last_seen_at?: string | null
        }
        Update: {
          admin_replied_at?: string | null
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          user_id?: string
          user_last_seen_at?: string | null
        }
        Relationships: []
      }
      tierce_suggestions: {
        Row: {
          bet_id: string
          comment: string | null
          created_at: string
          id: string
          prenom_suggested: string
          status: Database["public"]["Enums"]["suggestion_status"]
          suggested_by: string
        }
        Insert: {
          bet_id: string
          comment?: string | null
          created_at?: string
          id?: string
          prenom_suggested: string
          status?: Database["public"]["Enums"]["suggestion_status"]
          suggested_by: string
        }
        Update: {
          bet_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          prenom_suggested?: string
          status?: Database["public"]["Enums"]["suggestion_status"]
          suggested_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "tierce_suggestions_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: false
            referencedRelation: "bets"
            referencedColumns: ["id"]
          },
        ]
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
      wagers: {
        Row: {
          bet_id: string
          cote_au_moment_mise: number
          created_at: string
          id: string
          is_retracted: boolean
          montant_dc: number
          option_id: string
          retracted_at: string | null
          user_id: string
        }
        Insert: {
          bet_id: string
          cote_au_moment_mise: number
          created_at?: string
          id?: string
          is_retracted?: boolean
          montant_dc: number
          option_id: string
          retracted_at?: string | null
          user_id: string
        }
        Update: {
          bet_id?: string
          cote_au_moment_mise?: number
          created_at?: string
          id?: string
          is_retracted?: boolean
          montant_dc?: number
          option_id?: string
          retracted_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wagers_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: false
            referencedRelation: "bets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wagers_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "bet_options"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      tierce_suggestions_public: {
        Row: {
          bet_id: string | null
          created_at: string | null
          id: string | null
          prenom_suggested: string | null
          status: Database["public"]["Enums"]["suggestion_status"] | null
        }
        Insert: {
          bet_id?: string | null
          created_at?: string | null
          id?: string | null
          prenom_suggested?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"] | null
        }
        Update: {
          bet_id?: string | null
          created_at?: string | null
          id?: string | null
          prenom_suggested?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "tierce_suggestions_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: false
            referencedRelation: "bets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      auto_close_bet: { Args: { p_bet_id: string }; Returns: undefined }
      get_gouvernements_public: {
        Args: { p_session_id: string }
        Returns: {
          created_at: string
          data: Json
          id: string
          user_id: string
        }[]
      }
      get_km_results: {
        Args: { p_month_year: string }
        Returns: {
          category: Database["public"]["Enums"]["km_category"]
          vote_count: number
          voted_prenom: string
        }[]
      }
      get_km_top3: {
        Args: { p_month_year: string }
        Returns: {
          category: Database["public"]["Enums"]["km_category"]
          rank: number
          vote_count: number
          voted_prenom: string
        }[]
      }
      get_session_data_for_harassment: {
        Args: { p_session_ids: string[] }
        Returns: {
          data: Json
          session_id: string
        }[]
      }
      get_session_participation_counts: {
        Args: { p_session_ids: string[] }
        Returns: {
          participant_count: number
          session_id: string
        }[]
      }
      get_sondage_combos_public: {
        Args: { p_session_id: string }
        Returns: {
          combo: string
          user_id: string
        }[]
      }
      get_tierce_suggestions_public: {
        Args: { p_bet_id: string }
        Returns: {
          bet_id: string
          created_at: string
          id: string
          prenom_suggested: string
          status: Database["public"]["Enums"]["suggestion_status"]
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      place_sondage_vote: {
        Args: {
          p_bet_amount: number
          p_pronostic: string
          p_session_id: string
          p_user_id: string
          p_vote: string
        }
        Returns: Json
      }
      place_tournoi_bet: {
        Args: {
          p_bet_amount: number
          p_predicted_winner: string
          p_session_id: string
          p_user_id: string
        }
        Returns: Json
      }
      place_wager: {
        Args: {
          p_bet_id: string
          p_montant_dc: number
          p_option_id: string
          p_user_id: string
        }
        Returns: Json
      }
      recalculate_odds: { Args: { p_bet_id: string }; Returns: undefined }
      recount_proposal_votes: {
        Args: { p_proposal_id: string }
        Returns: {
          negatives: number
          positives: number
        }[]
      }
      resolve_bet: {
        Args: { p_bet_id: string; p_winning_option_ids: string[] }
        Returns: Json
      }
      resolve_sondage: { Args: { p_session_id: string }; Returns: Json }
      resolve_tournoi: { Args: { p_session_id: string }; Returns: Json }
      retract_wager: {
        Args: { p_user_id: string; p_wager_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "user"
      bet_category: "urgent" | "long_terme" | "culture_daim"
      bet_status:
        | "ouvert"
        | "cloture_en_attente"
        | "resolu"
        | "suspendu"
        | "supprime"
      bet_type:
        | "binaire"
        | "over_under"
        | "tranches_multiples"
        | "tierce_du_daim"
      game_session_status: "draft" | "active" | "voting" | "closed" | "archived"
      game_type: "sondage" | "tournoi" | "gouvernement" | "fantasy"
      km_category: "kiss" | "marry" | "coup_soir" | "plan_q"
      proposal_status: "en_attente" | "valide" | "rejete"
      resolution_mode: "admin" | "tirage_sort"
      suggestion_status: "en_attente" | "approuve" | "rejete"
      ticket_status: "ouvert" | "en_cours" | "resolu"
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
      bet_category: ["urgent", "long_terme", "culture_daim"],
      bet_status: [
        "ouvert",
        "cloture_en_attente",
        "resolu",
        "suspendu",
        "supprime",
      ],
      bet_type: [
        "binaire",
        "over_under",
        "tranches_multiples",
        "tierce_du_daim",
      ],
      game_session_status: ["draft", "active", "voting", "closed", "archived"],
      game_type: ["sondage", "tournoi", "gouvernement", "fantasy"],
      km_category: ["kiss", "marry", "coup_soir", "plan_q"],
      proposal_status: ["en_attente", "valide", "rejete"],
      resolution_mode: ["admin", "tirage_sort"],
      suggestion_status: ["en_attente", "approuve", "rejete"],
      ticket_status: ["ouvert", "en_cours", "resolu"],
    },
  },
} as const
