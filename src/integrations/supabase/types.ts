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
      admin_alerts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          body: string
          category: string
          created_at: string
          id: string
          metadata: Json
          severity: string
          title: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          body?: string
          category: string
          created_at?: string
          id?: string
          metadata?: Json
          severity: string
          title: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          body?: string
          category?: string
          created_at?: string
          id?: string
          metadata?: Json
          severity?: string
          title?: string
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      admin_broadcasts: {
        Row: {
          audience: string
          body: string
          created_at: string
          created_by: string
          id: string
          metadata: Json
          region: Json
          scheduled_for: string | null
          sent_at: string | null
          title: string
        }
        Insert: {
          audience?: string
          body: string
          created_at?: string
          created_by: string
          id?: string
          metadata?: Json
          region?: Json
          scheduled_for?: string | null
          sent_at?: string | null
          title: string
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          metadata?: Json
          region?: Json
          scheduled_for?: string | null
          sent_at?: string | null
          title?: string
        }
        Relationships: []
      }
      admin_sessions: {
        Row: {
          admin_id: string
          ended_at: string | null
          id: string
          ip_address: string | null
          last_seen_at: string
          started_at: string
          user_agent: string | null
        }
        Insert: {
          admin_id: string
          ended_at?: string | null
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          started_at?: string
          user_agent?: string | null
        }
        Update: {
          admin_id?: string
          ended_at?: string | null
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          started_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          category: string | null
          created_at: string
          event_name: string
          id: string
          metadata: Json
          post_id: string | null
          user_hash: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          event_name: string
          id?: string
          metadata?: Json
          post_id?: string | null
          user_hash?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          event_name?: string
          id?: string
          metadata?: Json
          post_id?: string | null
          user_hash?: string | null
        }
        Relationships: []
      }
      battle_tickets: {
        Row: {
          balance: number
          total_earned: number
          total_spent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          total_earned?: number
          total_spent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          total_earned?: number
          total_spent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      battle_votes: {
        Row: {
          battle_id: string
          created_at: string
          id: string
          user_id: string
          voted_for_user_id: string
        }
        Insert: {
          battle_id: string
          created_at?: string
          id?: string
          user_id: string
          voted_for_user_id: string
        }
        Update: {
          battle_id?: string
          created_at?: string
          id?: string
          user_id?: string
          voted_for_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "battle_votes_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battle_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battle_votes_voted_for_user_id_fkey"
            columns: ["voted_for_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      battler_follows: {
        Row: {
          battler_id: string
          created_at: string
          follower_id: string
          id: string
        }
        Insert: {
          battler_id: string
          created_at?: string
          follower_id: string
          id?: string
        }
        Update: {
          battler_id?: string
          created_at?: string
          follower_id?: string
          id?: string
        }
        Relationships: []
      }
      battles: {
        Row: {
          accepted_at: string | null
          challenger_id: string
          challenger_post_id: string | null
          challenger_votes: number
          created_at: string
          duration_seconds: number | null
          ends_at: string | null
          id: string
          opponent_id: string
          opponent_post_id: string | null
          opponent_votes: number
          status: Database["public"]["Enums"]["battle_status"]
          winner_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          challenger_id: string
          challenger_post_id?: string | null
          challenger_votes?: number
          created_at?: string
          duration_seconds?: number | null
          ends_at?: string | null
          id?: string
          opponent_id: string
          opponent_post_id?: string | null
          opponent_votes?: number
          status?: Database["public"]["Enums"]["battle_status"]
          winner_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          challenger_id?: string
          challenger_post_id?: string | null
          challenger_votes?: number
          created_at?: string
          duration_seconds?: number | null
          ends_at?: string | null
          id?: string
          opponent_id?: string
          opponent_post_id?: string | null
          opponent_votes?: number
          status?: Database["public"]["Enums"]["battle_status"]
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "battles_challenger_id_fkey"
            columns: ["challenger_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battles_challenger_post_id_fkey"
            columns: ["challenger_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battles_opponent_id_fkey"
            columns: ["opponent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battles_opponent_post_id_fkey"
            columns: ["opponent_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battles_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_reconciliations: {
        Row: {
          actual_charge_usd: number
          created_at: string
          created_by: string | null
          currency: string
          estimated_cost_usd: number
          id: string
          notes: string | null
          period_end: string
          period_start: string
        }
        Insert: {
          actual_charge_usd: number
          created_at?: string
          created_by?: string | null
          currency?: string
          estimated_cost_usd?: number
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
        }
        Update: {
          actual_charge_usd?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          estimated_cost_usd?: number
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
        }
        Relationships: []
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      boost_bundles: {
        Row: {
          active: boolean
          boost_type: string
          created_at: string
          duration_hours: number
          id: string
          label: string
          sort_order: number
          stripe_price_id: string
          usd: number
        }
        Insert: {
          active?: boolean
          boost_type: string
          created_at?: string
          duration_hours?: number
          id?: string
          label: string
          sort_order?: number
          stripe_price_id: string
          usd: number
        }
        Update: {
          active?: boolean
          boost_type?: string
          created_at?: string
          duration_hours?: number
          id?: string
          label?: string
          sort_order?: number
          stripe_price_id?: string
          usd?: number
        }
        Relationships: []
      }
      boost_tokens_ledger: {
        Row: {
          created_at: string
          delta: number
          id: string
          metadata: Json
          reason: string
          reference_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          metadata?: Json
          reason: string
          reference_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          metadata?: Json
          reason?: string
          reference_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boost_tokens_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      boosts: {
        Row: {
          active: boolean
          boost_type: Database["public"]["Enums"]["boost_type"]
          expires_at: string | null
          id: string
          post_id: string | null
          source: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          boost_type: Database["public"]["Enums"]["boost_type"]
          expires_at?: string | null
          id?: string
          post_id?: string | null
          source?: string | null
          started_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          boost_type?: Database["public"]["Enums"]["boost_type"]
          expires_at?: string | null
          id?: string
          post_id?: string | null
          source?: string | null
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boosts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boosts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      category_follows: {
        Row: {
          created_at: string
          id: string
          main_category_id: string | null
          state: string
          subcategory_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          main_category_id?: string | null
          state?: string
          subcategory_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          main_category_id?: string | null
          state?: string
          subcategory_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_follows_main_category_id_fkey"
            columns: ["main_category_id"]
            isOneToOne: false
            referencedRelation: "main_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_follows_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_rankings: {
        Row: {
          id: string
          main_slug: string
          period: Database["public"]["Enums"]["ranking_period"]
          prev_rank: number | null
          rank: number
          scope_type: Database["public"]["Enums"]["ranking_scope"]
          scope_value: string
          score: number
          snapshot_at: string
          subcategory_slug: string | null
          user_id: string
          votes: number
        }
        Insert: {
          id?: string
          main_slug: string
          period: Database["public"]["Enums"]["ranking_period"]
          prev_rank?: number | null
          rank: number
          scope_type: Database["public"]["Enums"]["ranking_scope"]
          scope_value?: string
          score?: number
          snapshot_at?: string
          subcategory_slug?: string | null
          user_id: string
          votes?: number
        }
        Update: {
          id?: string
          main_slug?: string
          period?: Database["public"]["Enums"]["ranking_period"]
          prev_rank?: number | null
          rank?: number
          scope_type?: Database["public"]["Enums"]["ranking_scope"]
          scope_value?: string
          score?: number
          snapshot_at?: string
          subcategory_slug?: string | null
          user_id?: string
          votes?: number
        }
        Relationships: []
      }
      category_suggestions: {
        Row: {
          created_at: string
          id: string
          main_category_id: string | null
          proposed_label: string
          proposed_slug: string | null
          rationale: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          suggested_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          main_category_id?: string | null
          proposed_label: string
          proposed_slug?: string | null
          rationale?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_by: string
        }
        Update: {
          created_at?: string
          id?: string
          main_category_id?: string | null
          proposed_label?: string
          proposed_slug?: string | null
          rationale?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_suggestions_main_category_id_fkey"
            columns: ["main_category_id"]
            isOneToOne: false
            referencedRelation: "main_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_tags: {
        Row: {
          created_at: string
          id: string
          post_count: number
          subcategory_id: string | null
          tag: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_count?: number
          subcategory_id?: string | null
          tag: string
        }
        Update: {
          created_at?: string
          id?: string
          post_count?: number
          subcategory_id?: string | null
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_tags_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      cloud_cost_assumptions: {
        Row: {
          created_at: string
          currency: string
          id: string
          metric_key: string
          notes: string | null
          provider: string
          unit_cost: number
          unit_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          metric_key: string
          notes?: string | null
          provider?: string
          unit_cost?: number
          unit_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          metric_key?: string
          notes?: string | null
          provider?: string
          unit_cost?: number
          unit_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      comment_reactions: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          edited_at: string | null
          id: string
          is_removed: boolean
          mention_user_ids: string[]
          parent_id: string | null
          post_id: string
          reply_count: number
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_removed?: boolean
          mention_user_ids?: string[]
          parent_id?: string | null
          post_id: string
          reply_count?: number
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_removed?: boolean
          mention_user_ids?: string[]
          parent_id?: string | null
          post_id?: string
          reply_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      connect_accounts: {
        Row: {
          charges_enabled: boolean
          created_at: string
          details_submitted: boolean
          id: string
          payouts_enabled: boolean
          stripe_account_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          charges_enabled?: boolean
          created_at?: string
          details_submitted?: boolean
          id?: string
          payouts_enabled?: boolean
          stripe_account_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          charges_enabled?: boolean
          created_at?: string
          details_submitted?: boolean
          id?: string
          payouts_enabled?: boolean
          stripe_account_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      content_takedowns: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          reason: string
          reason_code: string | null
          removed_by: string
          reversed_at: string | null
          reversed_by: string | null
          reversible: boolean
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          reason: string
          reason_code?: string | null
          removed_by: string
          reversed_at?: string | null
          reversed_by?: string | null
          reversible?: boolean
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          reason?: string
          reason_code?: string | null
          removed_by?: string
          reversed_at?: string | null
          reversed_by?: string | null
          reversible?: boolean
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      cost_alert_rules: {
        Row: {
          comparison_window: string
          created_at: string
          created_by: string | null
          feature: string | null
          id: string
          is_active: boolean
          metric_key: string
          name: string
          threshold_type: string
          threshold_value: number
          updated_at: string
        }
        Insert: {
          comparison_window?: string
          created_at?: string
          created_by?: string | null
          feature?: string | null
          id?: string
          is_active?: boolean
          metric_key: string
          name: string
          threshold_type: string
          threshold_value: number
          updated_at?: string
        }
        Update: {
          comparison_window?: string
          created_at?: string
          created_by?: string | null
          feature?: string | null
          id?: string
          is_active?: boolean
          metric_key?: string
          name?: string
          threshold_type?: string
          threshold_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      cost_alerts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          current_value: number
          feature: string | null
          id: string
          message: string
          metric_key: string
          percent_change: number
          previous_value: number
          rule_id: string | null
          severity: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          current_value?: number
          feature?: string | null
          id?: string
          message: string
          metric_key: string
          percent_change?: number
          previous_value?: number
          rule_id?: string | null
          severity?: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          current_value?: number
          feature?: string | null
          id?: string
          message?: string
          metric_key?: string
          percent_change?: number
          previous_value?: number
          rule_id?: string | null
          severity?: string
        }
        Relationships: []
      }
      creator_milestones: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          milestone_key: string
          required_count: number
          reward_type: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label: string
          milestone_key: string
          required_count: number
          reward_type: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          milestone_key?: string
          required_count?: number
          reward_type?: string
          sort_order?: number
        }
        Relationships: []
      }
      creator_programs: {
        Row: {
          application_note: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          referral_code: string | null
          rejected_reason: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          application_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          referral_code?: string | null
          rejected_reason?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          application_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          referral_code?: string | null
          rejected_reason?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      creator_referrals: {
        Row: {
          active_qualified: boolean
          active_qualified_at: string | null
          created_at: string
          creator_id: string
          email_verified: boolean
          first_battle_completed: boolean
          first_post_completed: boolean
          first_purchase_completed: boolean
          first_vote_completed: boolean
          fraud_flag: boolean
          fraud_reason: string | null
          id: string
          referral_code: string | null
          referred_user_id: string
          revenue_generated: number
          signup_completed: boolean
          updated_at: string
        }
        Insert: {
          active_qualified?: boolean
          active_qualified_at?: string | null
          created_at?: string
          creator_id: string
          email_verified?: boolean
          first_battle_completed?: boolean
          first_post_completed?: boolean
          first_purchase_completed?: boolean
          first_vote_completed?: boolean
          fraud_flag?: boolean
          fraud_reason?: string | null
          id?: string
          referral_code?: string | null
          referred_user_id: string
          revenue_generated?: number
          signup_completed?: boolean
          updated_at?: string
        }
        Update: {
          active_qualified?: boolean
          active_qualified_at?: string | null
          created_at?: string
          creator_id?: string
          email_verified?: boolean
          first_battle_completed?: boolean
          first_post_completed?: boolean
          first_purchase_completed?: boolean
          first_vote_completed?: boolean
          fraud_flag?: boolean
          fraud_reason?: string | null
          id?: string
          referral_code?: string | null
          referred_user_id?: string
          revenue_generated?: number
          signup_completed?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      creator_rewards: {
        Row: {
          created_at: string
          creator_id: string
          granted_at: string | null
          granted_by: string | null
          id: string
          metadata: Json
          milestone_key: string
          revoked_at: string | null
          reward_type: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          metadata?: Json
          milestone_key: string
          revoked_at?: string | null
          reward_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          metadata?: Json
          milestone_key?: string
          revoked_at?: string | null
          reward_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      cron_error_log: {
        Row: {
          context: Json
          created_at: string
          error_message: string | null
          id: string
          job_name: string
          sqlstate: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          error_message?: string | null
          id?: string
          job_name: string
          sqlstate?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          error_message?: string | null
          id?: string
          job_name?: string
          sqlstate?: string | null
        }
        Relationships: []
      }
      crown_map_points: {
        Row: {
          category: string | null
          city: string | null
          country: string | null
          crown_id: string | null
          id: string
          lat: number | null
          lng: number | null
          location_precision: string
          location_source: string | null
          metadata: Json
          post_id: string | null
          rank: number | null
          refreshed_at: string
          region_name: string | null
          region_type: string
          score: number
          state: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          city?: string | null
          country?: string | null
          crown_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location_precision?: string
          location_source?: string | null
          metadata?: Json
          post_id?: string | null
          rank?: number | null
          refreshed_at?: string
          region_name?: string | null
          region_type: string
          score?: number
          state?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          city?: string | null
          country?: string | null
          crown_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location_precision?: string
          location_source?: string | null
          metadata?: Json
          post_id?: string | null
          rank?: number | null
          refreshed_at?: string
          region_name?: string | null
          region_type?: string
          score?: number
          state?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crown_map_points_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crowns: {
        Row: {
          active: boolean
          category: Database["public"]["Enums"]["crown_category"]
          created_at: string
          crown_score: number
          ended_at: string | null
          id: string
          post_id: string | null
          region_name: string
          region_type: Database["public"]["Enums"]["region_type"]
          started_at: string
          title: string
          user_id: string
        }
        Insert: {
          active?: boolean
          category: Database["public"]["Enums"]["crown_category"]
          created_at?: string
          crown_score?: number
          ended_at?: string | null
          id?: string
          post_id?: string | null
          region_name: string
          region_type: Database["public"]["Enums"]["region_type"]
          started_at?: string
          title: string
          user_id: string
        }
        Update: {
          active?: boolean
          category?: Database["public"]["Enums"]["crown_category"]
          created_at?: string
          crown_score?: number
          ended_at?: string | null
          id?: string
          post_id?: string | null
          region_name?: string
          region_type?: Database["public"]["Enums"]["region_type"]
          started_at?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crowns_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crowns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reward_claims: {
        Row: {
          claim_date: string
          created_at: string
          day_in_streak: number
          id: string
          shekels_awarded: number
          user_id: string
        }
        Insert: {
          claim_date: string
          created_at?: string
          day_in_streak: number
          id?: string
          shekels_awarded: number
          user_id: string
        }
        Update: {
          claim_date?: string
          created_at?: string
          day_in_streak?: number
          id?: string
          shekels_awarded?: number
          user_id?: string
        }
        Relationships: []
      }
      daily_streaks: {
        Row: {
          bonus_spins: number
          current_streak: number
          last_claimed_at: string | null
          last_claimed_date: string | null
          last_spin_date: string | null
          longest_streak: number
          total_claims: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bonus_spins?: number
          current_streak?: number
          last_claimed_at?: string | null
          last_claimed_date?: string | null
          last_spin_date?: string | null
          longest_streak?: number
          total_claims?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bonus_spins?: number
          current_streak?: number
          last_claimed_at?: string | null
          last_claimed_date?: string | null
          last_spin_date?: string | null
          longest_streak?: number
          total_claims?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_usage_rollups: {
        Row: {
          created_at: string
          date: string
          estimated_cost: number
          feature: string
          id: string
          metadata: Json
          metric_key: string
          total_bytes: number
          total_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          estimated_cost?: number
          feature: string
          id?: string
          metadata?: Json
          metric_key: string
          total_bytes?: number
          total_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          estimated_cost?: number
          feature?: string
          id?: string
          metadata?: Json
          metric_key?: string
          total_bytes?: number
          total_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      db_health_snapshots: {
        Row: {
          captured_at: string
          commits: number
          commits_delta: number
          connections_active: number
          connections_max: number
          db_size_bytes: number
          deadlocks: number
          deadlocks_delta: number
          id: string
          metadata: Json
          rollback_rate: number
          rollbacks: number
          rollbacks_delta: number
          wal_size_bytes: number
        }
        Insert: {
          captured_at?: string
          commits?: number
          commits_delta?: number
          connections_active?: number
          connections_max?: number
          db_size_bytes?: number
          deadlocks?: number
          deadlocks_delta?: number
          id?: string
          metadata?: Json
          rollback_rate?: number
          rollbacks?: number
          rollbacks_delta?: number
          wal_size_bytes?: number
        }
        Update: {
          captured_at?: string
          commits?: number
          commits_delta?: number
          connections_active?: number
          connections_max?: number
          db_size_bytes?: number
          deadlocks?: number
          deadlocks_delta?: number
          id?: string
          metadata?: Json
          rollback_rate?: number
          rollbacks?: number
          rollbacks_delta?: number
          wal_size_bytes?: number
        }
        Relationships: []
      }
      dm_thread_members: {
        Row: {
          archived: boolean
          created_at: string
          last_read_at: string | null
          muted: boolean
          pinned: boolean
          thread_id: string
          unread_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          last_read_at?: string | null
          muted?: boolean
          pinned?: boolean
          thread_id: string
          unread_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          last_read_at?: string | null
          muted?: boolean
          pinned?: boolean
          thread_id?: string
          unread_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_thread_members_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "dm_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_thread_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_threads: {
        Row: {
          created_at: string
          gift_count: number
          id: string
          last_message_at: string | null
          last_message_id: string | null
          last_message_preview: string | null
          updated_at: string
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          gift_count?: number
          id?: string
          last_message_at?: string | null
          last_message_id?: string | null
          last_message_preview?: string | null
          updated_at?: string
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          gift_count?: number
          id?: string
          last_message_at?: string | null
          last_message_id?: string | null
          last_message_preview?: string | null
          updated_at?: string
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_threads_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_threads_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      error_logs: {
        Row: {
          created_at: string
          id: string
          level: string
          message: string
          metadata: Json
          source: string
          stack: string | null
          url: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          level?: string
          message: string
          metadata?: Json
          source: string
          stack?: string | null
          url?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          level?: string
          message?: string
          metadata?: Json
          source?: string
          stack?: string | null
          url?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          audience: string
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          key: string
          rollout_percent: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audience?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key: string
          rollout_percent?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audience?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key?: string
          rollout_percent?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      filter_streaks: {
        Row: {
          current_streak: number
          filter: string
          id: string
          last_vote_date: string
          longest_streak: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current_streak?: number
          filter: string
          id?: string
          last_vote_date: string
          longest_streak?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current_streak?: number
          filter?: string
          id?: string
          last_vote_date?: string
          longest_streak?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      finance_snapshots: {
        Row: {
          active_subscriptions: number
          canceled_subscriptions: number
          created_at: string
          id: string
          metadata: Json
          net_usd: number
          new_subscriptions: number
          payouts_usd: number
          refunds_usd: number
          revenue_usd: number
          snapshot_date: string
        }
        Insert: {
          active_subscriptions?: number
          canceled_subscriptions?: number
          created_at?: string
          id?: string
          metadata?: Json
          net_usd?: number
          new_subscriptions?: number
          payouts_usd?: number
          refunds_usd?: number
          revenue_usd?: number
          snapshot_date: string
        }
        Update: {
          active_subscriptions?: number
          canceled_subscriptions?: number
          created_at?: string
          id?: string
          metadata?: Json
          net_usd?: number
          new_subscriptions?: number
          payouts_usd?: number
          refunds_usd?: number
          revenue_usd?: number
          snapshot_date?: string
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      founder_grants: {
        Row: {
          dispute_resolved_at: string | null
          disputed_at: string | null
          granted_at: string
          id: string
          metadata: Json
          original_granted_at: string | null
          original_paid_amount_cents: number | null
          paid_amount_cents: number | null
          pre_dispute_status: string | null
          qualifying_invoice_id: string | null
          revoked_at: string | null
          revoked_reason: string | null
          revoked_stripe_event_id: string | null
          status: string
          stripe_dispute_id: string | null
          stripe_invoice_id: string | null
          user_id: string
        }
        Insert: {
          dispute_resolved_at?: string | null
          disputed_at?: string | null
          granted_at?: string
          id?: string
          metadata?: Json
          original_granted_at?: string | null
          original_paid_amount_cents?: number | null
          paid_amount_cents?: number | null
          pre_dispute_status?: string | null
          qualifying_invoice_id?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          revoked_stripe_event_id?: string | null
          status?: string
          stripe_dispute_id?: string | null
          stripe_invoice_id?: string | null
          user_id: string
        }
        Update: {
          dispute_resolved_at?: string | null
          disputed_at?: string | null
          granted_at?: string
          id?: string
          metadata?: Json
          original_granted_at?: string | null
          original_paid_amount_cents?: number | null
          paid_amount_cents?: number | null
          pre_dispute_status?: string | null
          qualifying_invoice_id?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          revoked_stripe_event_id?: string | null
          status?: string
          stripe_dispute_id?: string | null
          stripe_invoice_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "founder_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      founder_program_config: {
        Row: {
          active: boolean
          end_at: string
          founder_frame_variant: string
          founder_title: string
          id: number
          member_cap: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          end_at: string
          founder_frame_variant?: string
          founder_title?: string
          id?: number
          member_cap: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          end_at?: string
          founder_frame_variant?: string
          founder_title?: string
          id?: number
          member_cap?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      geo_public_centers: {
        Row: {
          created_at: string
          lat: number
          lng: number
          region_name_display: string
          region_name_key: string
          region_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          lat: number
          lng: number
          region_name_display: string
          region_name_key: string
          region_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          lat?: number
          lng?: number
          region_name_display?: string
          region_name_key?: string
          region_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      gift_transactions: {
        Row: {
          client_dedupe_key: string | null
          created_at: string
          gift_id: string
          gift_name: string
          id: string
          platform_fee_shekels: number
          post_id: string | null
          quantity: number
          receiver_earnings_shekels: number
          receiver_id: string
          sender_id: string
          status: string
          total_shekels: number
        }
        Insert: {
          client_dedupe_key?: string | null
          created_at?: string
          gift_id: string
          gift_name: string
          id?: string
          platform_fee_shekels?: number
          post_id?: string | null
          quantity?: number
          receiver_earnings_shekels?: number
          receiver_id: string
          sender_id: string
          status?: string
          total_shekels: number
        }
        Update: {
          client_dedupe_key?: string | null
          created_at?: string
          gift_id?: string
          gift_name?: string
          id?: string
          platform_fee_shekels?: number
          post_id?: string | null
          quantity?: number
          receiver_earnings_shekels?: number
          receiver_id?: string
          sender_id?: string
          status?: string
          total_shekels?: number
        }
        Relationships: [
          {
            foreignKeyName: "gift_transactions_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_transactions_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gifts: {
        Row: {
          active: boolean
          animation_type: string
          created_at: string
          icon: string
          id: string
          name: string
          rarity: string
          shekel_cost: number
          tier: string
          top_pick: boolean
          trending: boolean
          visibility_boost: boolean
        }
        Insert: {
          active?: boolean
          animation_type: string
          created_at?: string
          icon: string
          id: string
          name: string
          rarity: string
          shekel_cost: number
          tier: string
          top_pick?: boolean
          trending?: boolean
          visibility_boost?: boolean
        }
        Update: {
          active?: boolean
          animation_type?: string
          created_at?: string
          icon?: string
          id?: string
          name?: string
          rarity?: string
          shekel_cost?: number
          tier?: string
          top_pick?: boolean
          trending?: boolean
          visibility_boost?: boolean
        }
        Relationships: []
      }
      invite_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      invite_redemptions: {
        Row: {
          code: string
          created_at: string
          id: string
          invitee_id: string
          inviter_id: string
          pass_rewarded: boolean
          signup_rewarded: boolean
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          invitee_id: string
          inviter_id: string
          pass_rewarded?: boolean
          signup_rewarded?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          pass_rewarded?: boolean
          signup_rewarded?: boolean
        }
        Relationships: []
      }
      live_battle_comment_reports: {
        Row: {
          battle_id: string
          comment_id: string
          created_at: string
          id: string
          reason: string
          reporter_id: string
          status: string
        }
        Insert: {
          battle_id: string
          comment_id: string
          created_at?: string
          id?: string
          reason: string
          reporter_id: string
          status?: string
        }
        Update: {
          battle_id?: string
          comment_id?: string
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_battle_comment_reports_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "live_battles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_battle_comment_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "live_battle_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      live_battle_comments: {
        Row: {
          battle_id: string
          body: string
          created_at: string
          hidden_at: string | null
          hidden_by: string | null
          hide_reason: string | null
          id: string
          user_id: string
        }
        Insert: {
          battle_id: string
          body: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          hide_reason?: string | null
          id?: string
          user_id: string
        }
        Update: {
          battle_id?: string
          body?: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          hide_reason?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_battle_comments_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "live_battles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_battle_gifts: {
        Row: {
          battle_id: string
          created_at: string
          gift_id: string
          gift_name: string
          id: string
          quantity: number
          recipient_id: string
          sender_id: string
          total_shekels: number
          transaction_id: string | null
        }
        Insert: {
          battle_id: string
          created_at?: string
          gift_id: string
          gift_name: string
          id?: string
          quantity?: number
          recipient_id: string
          sender_id: string
          total_shekels?: number
          transaction_id?: string | null
        }
        Update: {
          battle_id?: string
          created_at?: string
          gift_id?: string
          gift_name?: string
          id?: string
          quantity?: number
          recipient_id?: string
          sender_id?: string
          total_shekels?: number
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_battle_gifts_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "live_battles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_battle_participants: {
        Row: {
          action: string
          actor_id: string
          battle_id: string
          created_at: string
          id: string
          target_user_id: string
        }
        Insert: {
          action: string
          actor_id: string
          battle_id: string
          created_at?: string
          id?: string
          target_user_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          battle_id?: string
          created_at?: string
          id?: string
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_battle_participants_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "live_battles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_battle_reports: {
        Row: {
          battle_id: string
          created_at: string
          handled_at: string | null
          handled_by: string | null
          id: string
          reason: string
          reporter_id: string
          status: string
        }
        Insert: {
          battle_id: string
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          reason: string
          reporter_id: string
          status?: string
        }
        Update: {
          battle_id?: string
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_battle_reports_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "live_battles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_battle_viewers: {
        Row: {
          battle_id: string
          last_seen_at: string
          viewer_id: string
        }
        Insert: {
          battle_id: string
          last_seen_at?: string
          viewer_id: string
        }
        Update: {
          battle_id?: string
          last_seen_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_battle_viewers_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "live_battles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_battle_votes: {
        Row: {
          battle_id: string
          choice: string
          created_at: string
          id: string
          viewer_id: string
        }
        Insert: {
          battle_id: string
          choice: string
          created_at?: string
          id?: string
          viewer_id: string
        }
        Update: {
          battle_id?: string
          choice?: string
          created_at?: string
          id?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_battle_votes_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "live_battles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_battles: {
        Row: {
          category_slug: string | null
          comments_locked: boolean
          created_at: string
          duration_seconds: number
          ended_reason: string | null
          ends_at: string | null
          force_ended_by: string | null
          go_live_at: string | null
          host_id: string
          host_ready: boolean
          host_votes: number
          id: string
          is_hidden: boolean
          keyword_filters: Json
          lobby_opened_at: string | null
          opponent_id: string
          opponent_ready: boolean
          opponent_votes: number
          peak_viewers: number
          region: string | null
          room_name: string
          scheduled_start_at: string | null
          slow_mode_seconds: number
          started_at: string | null
          status: string
          updated_at: string
          winner_id: string | null
        }
        Insert: {
          category_slug?: string | null
          comments_locked?: boolean
          created_at?: string
          duration_seconds?: number
          ended_reason?: string | null
          ends_at?: string | null
          force_ended_by?: string | null
          go_live_at?: string | null
          host_id: string
          host_ready?: boolean
          host_votes?: number
          id?: string
          is_hidden?: boolean
          keyword_filters?: Json
          lobby_opened_at?: string | null
          opponent_id: string
          opponent_ready?: boolean
          opponent_votes?: number
          peak_viewers?: number
          region?: string | null
          room_name: string
          scheduled_start_at?: string | null
          slow_mode_seconds?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          winner_id?: string | null
        }
        Update: {
          category_slug?: string | null
          comments_locked?: boolean
          created_at?: string
          duration_seconds?: number
          ended_reason?: string | null
          ends_at?: string | null
          force_ended_by?: string | null
          go_live_at?: string | null
          host_id?: string
          host_ready?: boolean
          host_votes?: number
          id?: string
          is_hidden?: boolean
          keyword_filters?: Json
          lobby_opened_at?: string | null
          opponent_id?: string
          opponent_ready?: boolean
          opponent_votes?: number
          peak_viewers?: number
          region?: string | null
          room_name?: string
          scheduled_start_at?: string | null
          slow_mode_seconds?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          winner_id?: string | null
        }
        Relationships: []
      }
      main_categories: {
        Row: {
          created_at: string
          description: string | null
          gradient: string | null
          icon: string | null
          id: string
          is_active: boolean
          label: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          gradient?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          label: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          gradient?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          label?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      media_hashes: {
        Row: {
          created_at: string
          hash: string
          id: string
          post_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          hash: string
          id?: string
          post_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          hash?: string
          id?: string
          post_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      message_reactions: {
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
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_name: string | null
          attachment_path: string | null
          attachment_size: number | null
          attachment_type: string | null
          body: string | null
          created_at: string
          delivered_at: string | null
          gift_seen_at: string | null
          gift_transaction_id: string | null
          id: string
          kind: string
          read: boolean
          receiver_id: string
          sender_id: string
          shared_post_id: string | null
          shared_profile_id: string | null
          thread_id: string | null
        }
        Insert: {
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          body?: string | null
          created_at?: string
          delivered_at?: string | null
          gift_seen_at?: string | null
          gift_transaction_id?: string | null
          id?: string
          kind?: string
          read?: boolean
          receiver_id: string
          sender_id: string
          shared_post_id?: string | null
          shared_profile_id?: string | null
          thread_id?: string | null
        }
        Update: {
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          body?: string | null
          created_at?: string
          delivered_at?: string | null
          gift_seen_at?: string | null
          gift_transaction_id?: string | null
          id?: string
          kind?: string
          read?: boolean
          receiver_id?: string
          sender_id?: string
          shared_post_id?: string | null
          shared_profile_id?: string | null
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_gift_transaction_id_fkey"
            columns: ["gift_transaction_id"]
            isOneToOne: false
            referencedRelation: "gift_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_gift_transaction_id_fkey"
            columns: ["gift_transaction_id"]
            isOneToOne: false
            referencedRelation: "gift_transactions_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_shared_post_id_fkey"
            columns: ["shared_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_shared_profile_id_fkey"
            columns: ["shared_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "dm_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_audit: {
        Row: {
          category: string
          confidence: number | null
          created_at: string
          id: string
          image_urls: string[] | null
          kind: string
          reason: string | null
          safe: boolean
          user_id: string
        }
        Insert: {
          category: string
          confidence?: number | null
          created_at?: string
          id?: string
          image_urls?: string[] | null
          kind: string
          reason?: string | null
          safe: boolean
          user_id: string
        }
        Update: {
          category?: string
          confidence?: number | null
          created_at?: string
          id?: string
          image_urls?: string[] | null
          kind?: string
          reason?: string | null
          safe?: boolean
          user_id?: string
        }
        Relationships: []
      }
      moderation_queue: {
        Row: {
          assigned_to: string | null
          created_at: string
          id: string
          metadata: Json
          priority: string
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          priority?: string
          reason: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          priority?: string
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      muted_dm_threads: {
        Row: {
          created_at: string
          id: string
          other_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          other_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          other_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      muted_threads: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "muted_threads_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      muted_words: {
        Row: {
          created_at: string
          id: string
          user_id: string
          word: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          word: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          word?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          battle_invite_alerts: boolean
          battle_winner_alerts: boolean
          dm_alerts: boolean
          mention_alerts: boolean
          push_enabled: boolean
          reply_alerts: boolean
          sound_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          battle_invite_alerts?: boolean
          battle_winner_alerts?: boolean
          dm_alerts?: boolean
          mention_alerts?: boolean
          push_enabled?: boolean
          reply_alerts?: boolean
          sound_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          battle_invite_alerts?: boolean
          battle_winner_alerts?: boolean
          dm_alerts?: boolean
          mention_alerts?: boolean
          push_enabled?: boolean
          reply_alerts?: boolean
          sound_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          payload: Json | null
          read: boolean
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          read?: boolean
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          read?: boolean
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount_usd: number | null
          created_at: string
          currency: string
          description: string | null
          id: string
          intent: string
          metadata: Json
          provider: string
          provider_event_id: string | null
          reference_id: string | null
          reference_table: string | null
          shekels_delta: number
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_usd?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          intent: string
          metadata?: Json
          provider: string
          provider_event_id?: string | null
          reference_id?: string | null
          reference_table?: string | null
          shekels_delta?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_usd?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          intent?: string
          metadata?: Json
          provider?: string
          provider_event_id?: string | null
          reference_id?: string | null
          reference_table?: string | null
          shekels_delta?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount_usd: number
          created_at: string
          frozen: boolean
          frozen_at: string | null
          frozen_by: string | null
          frozen_reason: string | null
          id: string
          metadata: Json
          paid_at: string | null
          payout_method: string | null
          shekels_locked: number
          status: string
          stripe_account_id: string | null
          stripe_payout_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_usd: number
          created_at?: string
          frozen?: boolean
          frozen_at?: string | null
          frozen_by?: string | null
          frozen_reason?: string | null
          id?: string
          metadata?: Json
          paid_at?: string | null
          payout_method?: string | null
          shekels_locked?: number
          status?: string
          stripe_account_id?: string | null
          stripe_payout_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_usd?: number
          created_at?: string
          frozen?: boolean
          frozen_at?: string | null
          frozen_by?: string | null
          frozen_reason?: string | null
          id?: string
          metadata?: Json
          paid_at?: string | null
          payout_method?: string | null
          shekels_locked?: number
          status?: string
          stripe_account_id?: string | null
          stripe_payout_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pinned_dm_threads: {
        Row: {
          created_at: string
          id: string
          other_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          other_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          other_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          created_at: string
          description: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          description?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      post_bookmarks: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_bookmarks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_drafts: {
        Row: {
          caption: string | null
          category: string | null
          city: string | null
          country: string | null
          cover_url: string | null
          created_at: string
          id: string
          image_urls: string[]
          photo_filter: string | null
          state: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          category?: string | null
          city?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string
          id?: string
          image_urls?: string[]
          photo_filter?: string | null
          state?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          caption?: string | null
          category?: string | null
          city?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string
          id?: string
          image_urls?: string[]
          photo_filter?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      post_edits_audit: {
        Row: {
          changed_fields: string[]
          created_at: string
          editor_user_id: string
          id: string
          moderation_impact: boolean
          new_values: Json
          post_id: string
          previous_values: Json
          request_id: string | null
          source: string | null
        }
        Insert: {
          changed_fields?: string[]
          created_at?: string
          editor_user_id: string
          id?: string
          moderation_impact?: boolean
          new_values?: Json
          post_id: string
          previous_values?: Json
          request_id?: string | null
          source?: string | null
        }
        Update: {
          changed_fields?: string[]
          created_at?: string
          editor_user_id?: string
          id?: string
          moderation_impact?: boolean
          new_values?: Json
          post_id?: string
          previous_values?: Json
          request_id?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_edits_audit_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_media: {
        Row: {
          alt_text: string | null
          blurhash: string | null
          bytes: number | null
          created_at: string
          deleted_at: string | null
          duration_ms: number | null
          height: number | null
          id: string
          is_sensitive: boolean
          kind: string
          mime_type: string | null
          moderation_status: string
          position: number
          post_id: string
          public_url: string | null
          safe_variant_path: string | null
          storage_bucket: string
          storage_path: string
          updated_at: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          blurhash?: string | null
          bytes?: number | null
          created_at?: string
          deleted_at?: string | null
          duration_ms?: number | null
          height?: number | null
          id?: string
          is_sensitive?: boolean
          kind: string
          mime_type?: string | null
          moderation_status?: string
          position?: number
          post_id: string
          public_url?: string | null
          safe_variant_path?: string | null
          storage_bucket?: string
          storage_path: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          blurhash?: string | null
          bytes?: number | null
          created_at?: string
          deleted_at?: string | null
          duration_ms?: number | null
          height?: number | null
          id?: string
          is_sensitive?: boolean
          kind?: string
          mime_type?: string | null
          moderation_status?: string
          position?: number
          post_id?: string
          public_url?: string | null
          safe_variant_path?: string | null
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_media_ai_analysis: {
        Row: {
          analysis_status: string
          confidence_score: number | null
          created_at: string
          detected_language: string | null
          detected_objects: Json
          duration_ms: number | null
          error_message: string | null
          extracted_text: string | null
          id: string
          media_urls: string[]
          model_name: string
          moderation_reason: string | null
          post_id: string
          raw_ai_response: Json | null
          retry_count: number
          safety_flags: Json
          safety_status: string
          suggested_master_category: string | null
          suggested_topic: string | null
          text_flags: Json
          token_usage: Json | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          analysis_status?: string
          confidence_score?: number | null
          created_at?: string
          detected_language?: string | null
          detected_objects?: Json
          duration_ms?: number | null
          error_message?: string | null
          extracted_text?: string | null
          id?: string
          media_urls?: string[]
          model_name?: string
          moderation_reason?: string | null
          post_id: string
          raw_ai_response?: Json | null
          retry_count?: number
          safety_flags?: Json
          safety_status?: string
          suggested_master_category?: string | null
          suggested_topic?: string | null
          text_flags?: Json
          token_usage?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          analysis_status?: string
          confidence_score?: number | null
          created_at?: string
          detected_language?: string | null
          detected_objects?: Json
          duration_ms?: number | null
          error_message?: string | null
          extracted_text?: string | null
          id?: string
          media_urls?: string[]
          model_name?: string
          moderation_reason?: string | null
          post_id?: string
          raw_ai_response?: Json | null
          retry_count?: number
          safety_flags?: Json
          safety_status?: string
          suggested_master_category?: string | null
          suggested_topic?: string | null
          text_flags?: Json
          token_usage?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_media_ai_analysis_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          ai_searchable_text: string | null
          ai_suggested_main_category_slug: string | null
          alt_texts: string[]
          archived_at: string | null
          aspect_ratio: string | null
          battle_wins: number
          caption: string | null
          category: Database["public"]["Enums"]["crown_category"]
          city: string | null
          client_request_id: string | null
          comment_count: number
          content_rating: Database["public"]["Enums"]["content_rating"]
          content_type: string
          country: string | null
          created_at: string
          crown_score: number
          crown_shield_until: string | null
          duration_ms: number | null
          edited_at: string | null
          filter: string | null
          filter_type: string | null
          hashtags: string[]
          id: string
          image_url: string
          image_urls: string[]
          is_archived: boolean
          is_removed: boolean
          is_sensitive: boolean
          location_captured_at: string | null
          location_enabled: boolean
          location_label: string | null
          location_source: string | null
          main_category_slug: string | null
          media_height: number | null
          media_origin: string | null
          media_type: string
          media_width: number | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_notes: string | null
          moderation_status: Database["public"]["Enums"]["moderation_status"]
          parent_post_id: string | null
          photo_filter: string | null
          pinned_at: string | null
          post_lat: number | null
          post_lng: number | null
          post_location_precision: string
          publish_status: string
          region_name: string | null
          region_type: string | null
          repost_caption: string | null
          repost_count: number
          royal_boost_until: string | null
          scheduled_for: string | null
          sensitive_reason: string | null
          share_count: number
          spotlight_until: string | null
          state: string | null
          subcategory_slug: string | null
          submission_key: string | null
          tagged_user_ids: string[]
          user_id: string
          video_filter: string | null
          video_poster_url: string | null
          video_url: string | null
          vote_boost_until: string | null
          vote_count: number
        }
        Insert: {
          ai_searchable_text?: string | null
          ai_suggested_main_category_slug?: string | null
          alt_texts?: string[]
          archived_at?: string | null
          aspect_ratio?: string | null
          battle_wins?: number
          caption?: string | null
          category?: Database["public"]["Enums"]["crown_category"]
          city?: string | null
          client_request_id?: string | null
          comment_count?: number
          content_rating?: Database["public"]["Enums"]["content_rating"]
          content_type?: string
          country?: string | null
          created_at?: string
          crown_score?: number
          crown_shield_until?: string | null
          duration_ms?: number | null
          edited_at?: string | null
          filter?: string | null
          filter_type?: string | null
          hashtags?: string[]
          id?: string
          image_url: string
          image_urls?: string[]
          is_archived?: boolean
          is_removed?: boolean
          is_sensitive?: boolean
          location_captured_at?: string | null
          location_enabled?: boolean
          location_label?: string | null
          location_source?: string | null
          main_category_slug?: string | null
          media_height?: number | null
          media_origin?: string | null
          media_type?: string
          media_width?: number | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_notes?: string | null
          moderation_status?: Database["public"]["Enums"]["moderation_status"]
          parent_post_id?: string | null
          photo_filter?: string | null
          pinned_at?: string | null
          post_lat?: number | null
          post_lng?: number | null
          post_location_precision?: string
          publish_status?: string
          region_name?: string | null
          region_type?: string | null
          repost_caption?: string | null
          repost_count?: number
          royal_boost_until?: string | null
          scheduled_for?: string | null
          sensitive_reason?: string | null
          share_count?: number
          spotlight_until?: string | null
          state?: string | null
          subcategory_slug?: string | null
          submission_key?: string | null
          tagged_user_ids?: string[]
          user_id: string
          video_filter?: string | null
          video_poster_url?: string | null
          video_url?: string | null
          vote_boost_until?: string | null
          vote_count?: number
        }
        Update: {
          ai_searchable_text?: string | null
          ai_suggested_main_category_slug?: string | null
          alt_texts?: string[]
          archived_at?: string | null
          aspect_ratio?: string | null
          battle_wins?: number
          caption?: string | null
          category?: Database["public"]["Enums"]["crown_category"]
          city?: string | null
          client_request_id?: string | null
          comment_count?: number
          content_rating?: Database["public"]["Enums"]["content_rating"]
          content_type?: string
          country?: string | null
          created_at?: string
          crown_score?: number
          crown_shield_until?: string | null
          duration_ms?: number | null
          edited_at?: string | null
          filter?: string | null
          filter_type?: string | null
          hashtags?: string[]
          id?: string
          image_url?: string
          image_urls?: string[]
          is_archived?: boolean
          is_removed?: boolean
          is_sensitive?: boolean
          location_captured_at?: string | null
          location_enabled?: boolean
          location_label?: string | null
          location_source?: string | null
          main_category_slug?: string | null
          media_height?: number | null
          media_origin?: string | null
          media_type?: string
          media_width?: number | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_notes?: string | null
          moderation_status?: Database["public"]["Enums"]["moderation_status"]
          parent_post_id?: string | null
          photo_filter?: string | null
          pinned_at?: string | null
          post_lat?: number | null
          post_lng?: number | null
          post_location_precision?: string
          publish_status?: string
          region_name?: string | null
          region_type?: string | null
          repost_caption?: string | null
          repost_count?: number
          royal_boost_until?: string | null
          scheduled_for?: string | null
          sensitive_reason?: string | null
          share_count?: number
          spotlight_until?: string | null
          state?: string | null
          subcategory_slug?: string | null
          submission_key?: string | null
          tagged_user_ids?: string[]
          user_id?: string
          video_filter?: string | null
          video_poster_url?: string | null
          video_url?: string | null
          vote_boost_until?: string | null
          vote_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "posts_parent_post_id_fkey"
            columns: ["parent_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_change_log: {
        Row: {
          change_type: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          change_type: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          change_type?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_visits: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          visitor_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          visitor_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          visitor_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auto_accept_battles_from_follows: boolean
          autoplay_cellular: boolean
          autosave_to_camera_roll: boolean
          avatar_position_y: number
          banned_at: string | null
          banned_by: string | null
          banned_reason: string | null
          banner_position_y: number
          banner_url: string | null
          battle_wins: number
          bio: string | null
          boost_tokens_balance: number
          captions_default_on: boolean
          city: string | null
          country: string | null
          created_at: string
          crown_score: number
          crowns_held: number
          crowns_total: number
          deactivated_at: string | null
          default_battle_stake: number
          default_category: string | null
          default_comments_enabled: boolean
          default_post_visibility: string
          default_race_scope: string
          deletion_requested_at: string | null
          first_name: string | null
          followers_count: number
          following_count: number
          founder_granted_at: string | null
          founder_title: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          hide_comments: boolean
          hide_likes: boolean
          hide_views: boolean
          high_contrast: boolean
          id: string
          is_banned: boolean
          is_founder: boolean
          is_private: boolean
          is_suspended: boolean
          larger_text: boolean
          last_name: string | null
          liked_posts_public: boolean
          links: Json
          locale: string
          posts_visibility: string
          profile_photo_url: string | null
          pronouns: string | null
          push_battles: boolean
          push_comments: boolean
          push_follows: boolean
          push_likes: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          reduce_motion: boolean
          royal_frame_variant: string | null
          sensitive_content_mode: string
          state: string | null
          tag_review_required: boolean
          timezone: string | null
          updated_at: string
          username: string
          verification_plan: string | null
          verified: boolean
          verified_at: string | null
          vote_privacy: string
          votes_given: number
          votes_received: number
          watermark_enabled: boolean
          who_can_dm: string
          who_can_mention: string
          who_can_tag: string
        }
        Insert: {
          auto_accept_battles_from_follows?: boolean
          autoplay_cellular?: boolean
          autosave_to_camera_roll?: boolean
          avatar_position_y?: number
          banned_at?: string | null
          banned_by?: string | null
          banned_reason?: string | null
          banner_position_y?: number
          banner_url?: string | null
          battle_wins?: number
          bio?: string | null
          boost_tokens_balance?: number
          captions_default_on?: boolean
          city?: string | null
          country?: string | null
          created_at?: string
          crown_score?: number
          crowns_held?: number
          crowns_total?: number
          deactivated_at?: string | null
          default_battle_stake?: number
          default_category?: string | null
          default_comments_enabled?: boolean
          default_post_visibility?: string
          default_race_scope?: string
          deletion_requested_at?: string | null
          first_name?: string | null
          followers_count?: number
          following_count?: number
          founder_granted_at?: string | null
          founder_title?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          hide_comments?: boolean
          hide_likes?: boolean
          hide_views?: boolean
          high_contrast?: boolean
          id: string
          is_banned?: boolean
          is_founder?: boolean
          is_private?: boolean
          is_suspended?: boolean
          larger_text?: boolean
          last_name?: string | null
          liked_posts_public?: boolean
          links?: Json
          locale?: string
          posts_visibility?: string
          profile_photo_url?: string | null
          pronouns?: string | null
          push_battles?: boolean
          push_comments?: boolean
          push_follows?: boolean
          push_likes?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          reduce_motion?: boolean
          royal_frame_variant?: string | null
          sensitive_content_mode?: string
          state?: string | null
          tag_review_required?: boolean
          timezone?: string | null
          updated_at?: string
          username: string
          verification_plan?: string | null
          verified?: boolean
          verified_at?: string | null
          vote_privacy?: string
          votes_given?: number
          votes_received?: number
          watermark_enabled?: boolean
          who_can_dm?: string
          who_can_mention?: string
          who_can_tag?: string
        }
        Update: {
          auto_accept_battles_from_follows?: boolean
          autoplay_cellular?: boolean
          autosave_to_camera_roll?: boolean
          avatar_position_y?: number
          banned_at?: string | null
          banned_by?: string | null
          banned_reason?: string | null
          banner_position_y?: number
          banner_url?: string | null
          battle_wins?: number
          bio?: string | null
          boost_tokens_balance?: number
          captions_default_on?: boolean
          city?: string | null
          country?: string | null
          created_at?: string
          crown_score?: number
          crowns_held?: number
          crowns_total?: number
          deactivated_at?: string | null
          default_battle_stake?: number
          default_category?: string | null
          default_comments_enabled?: boolean
          default_post_visibility?: string
          default_race_scope?: string
          deletion_requested_at?: string | null
          first_name?: string | null
          followers_count?: number
          following_count?: number
          founder_granted_at?: string | null
          founder_title?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          hide_comments?: boolean
          hide_likes?: boolean
          hide_views?: boolean
          high_contrast?: boolean
          id?: string
          is_banned?: boolean
          is_founder?: boolean
          is_private?: boolean
          is_suspended?: boolean
          larger_text?: boolean
          last_name?: string | null
          liked_posts_public?: boolean
          links?: Json
          locale?: string
          posts_visibility?: string
          profile_photo_url?: string | null
          pronouns?: string | null
          push_battles?: boolean
          push_comments?: boolean
          push_follows?: boolean
          push_likes?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          reduce_motion?: boolean
          royal_frame_variant?: string | null
          sensitive_content_mode?: string
          state?: string | null
          tag_review_required?: boolean
          timezone?: string | null
          updated_at?: string
          username?: string
          verification_plan?: string | null
          verified?: boolean
          verified_at?: string | null
          vote_privacy?: string
          votes_given?: number
          votes_received?: number
          watermark_enabled?: boolean
          who_can_dm?: string
          who_can_mention?: string
          who_can_tag?: string
        }
        Relationships: []
      }
      profiles_private: {
        Row: {
          age_confirmed: boolean
          created_at: string
          dob: string
          email: string | null
          id: string
          onboarded_at: string | null
          onboarding_step: number
          policies_accepted_at: string | null
          updated_at: string
          welcome_email_sent_at: string | null
        }
        Insert: {
          age_confirmed?: boolean
          created_at?: string
          dob?: string
          email?: string | null
          id: string
          onboarded_at?: string | null
          onboarding_step?: number
          policies_accepted_at?: string | null
          updated_at?: string
          welcome_email_sent_at?: string | null
        }
        Update: {
          age_confirmed?: boolean
          created_at?: string
          dob?: string
          email?: string | null
          id?: string
          onboarded_at?: string | null
          onboarding_step?: number
          policies_accepted_at?: string | null
          updated_at?: string
          welcome_email_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_private_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rank_snapshots: {
        Row: {
          captured_at: string
          category: Database["public"]["Enums"]["crown_category"]
          crown_score: number
          id: string
          main_category_slug: string | null
          post_id: string
          rank: number | null
          region: string
          scope: Database["public"]["Enums"]["region_type"]
          subcategory_slug: string | null
          total: number
        }
        Insert: {
          captured_at?: string
          category: Database["public"]["Enums"]["crown_category"]
          crown_score?: number
          id?: string
          main_category_slug?: string | null
          post_id: string
          rank?: number | null
          region: string
          scope: Database["public"]["Enums"]["region_type"]
          subcategory_slug?: string | null
          total?: number
        }
        Update: {
          captured_at?: string
          category?: Database["public"]["Enums"]["crown_category"]
          crown_score?: number
          id?: string
          main_category_slug?: string | null
          post_id?: string
          rank?: number | null
          region?: string
          scope?: Database["public"]["Enums"]["region_type"]
          subcategory_slug?: string | null
          total?: number
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          created_at: string
          id: number
          ip: string | null
          key: string
          user_id: string | null
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          created_at?: string
          id?: number
          ip?: string | null
          key: string
          user_id?: string | null
          window_start?: string
        }
        Update: {
          bucket?: string
          count?: number
          created_at?: string
          id?: number
          ip?: string | null
          key?: string
          user_id?: string | null
          window_start?: string
        }
        Relationships: []
      }
      report_appeals: {
        Row: {
          body: string
          created_at: string
          evidence_paths: string[]
          id: string
          mod_notes: string | null
          report_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          evidence_paths?: string[]
          id?: string
          mod_notes?: string | null
          report_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          evidence_paths?: string[]
          id?: string
          mod_notes?: string | null
          report_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          comment_id: string | null
          created_at: string
          evidence_paths: string[]
          id: string
          mod_notes: string | null
          post_id: string | null
          reason: string
          reason_code: string | null
          reported_user_id: string | null
          reporter_id: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["report_status"]
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          evidence_paths?: string[]
          id?: string
          mod_notes?: string | null
          post_id?: string | null
          reason: string
          reason_code?: string | null
          reported_user_id?: string | null
          reporter_id: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          evidence_paths?: string[]
          id?: string
          mod_notes?: string | null
          post_id?: string | null
          reason?: string
          reason_code?: string | null
          reported_user_id?: string | null
          reporter_id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Relationships: [
          {
            foreignKeyName: "reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      repost_attempts_log: {
        Row: {
          actor_user_id: string | null
          created_at: string
          eligibility_code: string | null
          failure_code: string | null
          id: string
          normalized_main_slug: string | null
          normalized_sub_slug: string | null
          outcome: string
          parent_owner_id: string | null
          parent_post_id: string | null
          raw_main_slug: string | null
          raw_sub_slug: string | null
          repost_id: string | null
          request_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          eligibility_code?: string | null
          failure_code?: string | null
          id?: string
          normalized_main_slug?: string | null
          normalized_sub_slug?: string | null
          outcome: string
          parent_owner_id?: string | null
          parent_post_id?: string | null
          raw_main_slug?: string | null
          raw_sub_slug?: string | null
          repost_id?: string | null
          request_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          eligibility_code?: string | null
          failure_code?: string | null
          id?: string
          normalized_main_slug?: string | null
          normalized_sub_slug?: string | null
          outcome?: string
          parent_owner_id?: string | null
          parent_post_id?: string | null
          raw_main_slug?: string | null
          raw_sub_slug?: string | null
          repost_id?: string | null
          request_id?: string | null
        }
        Relationships: []
      }
      restricted_users: {
        Row: {
          created_at: string
          id: string
          target_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          target_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          target_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      royal_pass_grants: {
        Row: {
          boost_tokens_granted: number
          created_at: string
          dispute_resolved_at: string | null
          dispute_status: string | null
          disputed_at: string | null
          founder_granted: boolean
          id: string
          metadata: Json
          period_end: string
          period_start: string
          pre_dispute_status: string | null
          reversal_stripe_event_id: string | null
          reversed_at: string | null
          reversed_reason: string | null
          shekels_granted: number
          shields_granted: number
          status: string
          stripe_charge_id: string | null
          stripe_dispute_id: string | null
          stripe_event_id: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          stripe_subscription_id: string | null
          user_id: string
        }
        Insert: {
          boost_tokens_granted?: number
          created_at?: string
          dispute_resolved_at?: string | null
          dispute_status?: string | null
          disputed_at?: string | null
          founder_granted?: boolean
          id?: string
          metadata?: Json
          period_end: string
          period_start: string
          pre_dispute_status?: string | null
          reversal_stripe_event_id?: string | null
          reversed_at?: string | null
          reversed_reason?: string | null
          shekels_granted?: number
          shields_granted?: number
          status?: string
          stripe_charge_id?: string | null
          stripe_dispute_id?: string | null
          stripe_event_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          user_id: string
        }
        Update: {
          boost_tokens_granted?: number
          created_at?: string
          dispute_resolved_at?: string | null
          dispute_status?: string | null
          disputed_at?: string | null
          founder_granted?: boolean
          id?: string
          metadata?: Json
          period_end?: string
          period_start?: string
          pre_dispute_status?: string | null
          reversal_stripe_event_id?: string | null
          reversed_at?: string | null
          reversed_reason?: string | null
          shekels_granted?: number
          shields_granted?: number
          status?: string
          stripe_charge_id?: string | null
          stripe_dispute_id?: string | null
          stripe_event_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "royal_pass_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      royal_pass_plans: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: string
          interval: string
          name: string
          sort_order: number
          stripe_price_id: string
          updated_at: string
          usd: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          interval?: string
          name: string
          sort_order?: number
          stripe_price_id: string
          updated_at?: string
          usd: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          interval?: string
          name?: string
          sort_order?: number
          stripe_price_id?: string
          updated_at?: string
          usd?: number
        }
        Relationships: []
      }
      royal_pass_shield_allowances: {
        Row: {
          granted_at: string
          id: string
          period_end: string
          period_start: string
          royal_pass_grant_id: string
          shields_granted: number
          shields_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          id?: string
          period_end: string
          period_start: string
          royal_pass_grant_id: string
          shields_granted?: number
          shields_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          granted_at?: string
          id?: string
          period_end?: string
          period_start?: string
          royal_pass_grant_id?: string
          shields_granted?: number
          shields_used?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "royal_pass_shield_allowances_grant_fk"
            columns: ["royal_pass_grant_id"]
            isOneToOne: false
            referencedRelation: "royal_pass_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "royal_pass_shield_allowances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      royal_pass_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "royal_pass_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "royal_pass_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      sensitive_appeals: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_type: string
          id: string
          moderator_notes: string | null
          post_id: string | null
          status: Database["public"]["Enums"]["sensitive_appeal_status"]
          updated_at: string
          user_id: string
          user_statement: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_type?: string
          id?: string
          moderator_notes?: string | null
          post_id?: string | null
          status?: Database["public"]["Enums"]["sensitive_appeal_status"]
          updated_at?: string
          user_id: string
          user_statement: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_type?: string
          id?: string
          moderator_notes?: string | null
          post_id?: string | null
          status?: Database["public"]["Enums"]["sensitive_appeal_status"]
          updated_at?: string
          user_id?: string
          user_statement?: string
        }
        Relationships: []
      }
      share_cards: {
        Row: {
          created_at: string
          generated_at: string
          id: string
          image_path: string
          invalidated_at: string | null
          is_sensitive_safe: boolean
          metadata: Json
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          generated_at?: string
          id?: string
          image_path: string
          invalidated_at?: string | null
          is_sensitive_safe?: boolean
          metadata?: Json
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          generated_at?: string
          id?: string
          image_path?: string
          invalidated_at?: string | null
          is_sensitive_safe?: boolean
          metadata?: Json
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      share_events: {
        Row: {
          channel: string
          created_at: string
          id: string
          metadata: Json
          sharer_user_id: string | null
          target_id: string
          target_type: string
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          metadata?: Json
          sharer_user_id?: string | null
          target_id: string
          target_type: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          metadata?: Json
          sharer_user_id?: string | null
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_events_sharer_user_id_fkey"
            columns: ["sharer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shekel_bundles: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          shekels: number
          sort_order: number
          stripe_price_id: string
          usd: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label: string
          shekels: number
          sort_order?: number
          stripe_price_id: string
          usd: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          shekels?: number
          sort_order?: number
          stripe_price_id?: string
          usd?: number
        }
        Relationships: []
      }
      shekel_ledger: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string
          metadata: Json
          reference_id: string | null
          shekels_delta: number
          stripe_event_id: string | null
          stripe_session_id: string | null
          usd_amount: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          label: string
          metadata?: Json
          reference_id?: string | null
          shekels_delta: number
          stripe_event_id?: string | null
          stripe_session_id?: string | null
          usd_amount?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string
          metadata?: Json
          reference_id?: string | null
          shekels_delta?: number
          stripe_event_id?: string | null
          stripe_session_id?: string | null
          usd_amount?: number | null
          user_id?: string
        }
        Relationships: []
      }
      spin_wheel_prizes: {
        Row: {
          active: boolean
          color_hex: string | null
          created_at: string
          id: string
          label: string
          prize_type: string
          prize_value: number
          remaining_stock: number | null
          sort_order: number
          updated_at: string
          weight: number
        }
        Insert: {
          active?: boolean
          color_hex?: string | null
          created_at?: string
          id?: string
          label: string
          prize_type: string
          prize_value?: number
          remaining_stock?: number | null
          sort_order?: number
          updated_at?: string
          weight?: number
        }
        Update: {
          active?: boolean
          color_hex?: string | null
          created_at?: string
          id?: string
          label?: string
          prize_type?: string
          prize_value?: number
          remaining_stock?: number | null
          sort_order?: number
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      spin_wheel_spins: {
        Row: {
          created_at: string
          id: string
          prize_id: string | null
          prize_type: string
          prize_value: number
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          prize_id?: string | null
          prize_type: string
          prize_value: number
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          prize_id?: string | null
          prize_type?: string
          prize_value?: number
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      streak_reminders_sent: {
        Row: {
          channel: string
          created_at: string
          id: string
          sent_for_date: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          sent_for_date: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          sent_for_date?: string
          user_id?: string
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          id: string
          received_at: string
          type: string
        }
        Insert: {
          id: string
          received_at?: string
          type: string
        }
        Update: {
          id?: string
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      subcategories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_featured: boolean
          label: string
          legacy_enum: string | null
          main_category_id: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          label: string
          legacy_enum?: string | null
          main_category_id: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          label?: string
          legacy_enum?: string | null
          main_category_id?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_main_category_id_fkey"
            columns: ["main_category_id"]
            isOneToOne: false
            referencedRelation: "main_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          body: string
          category: string
          created_at: string
          id: string
          metadata: Json
          priority: string
          resolved_at: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          body: string
          category?: string
          created_at?: string
          id?: string
          metadata?: Json
          priority?: string
          resolved_at?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          body?: string
          category?: string
          created_at?: string
          id?: string
          metadata?: Json
          priority?: string
          resolved_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tournament_matches: {
        Row: {
          battle_id: string | null
          created_at: string
          host_id: string | null
          id: string
          next_match_id: string | null
          next_slot: number | null
          opponent_id: string | null
          round: number
          slot: number
          status: string
          tournament_id: string
          winner_id: string | null
        }
        Insert: {
          battle_id?: string | null
          created_at?: string
          host_id?: string | null
          id?: string
          next_match_id?: string | null
          next_slot?: number | null
          opponent_id?: string | null
          round: number
          slot: number
          status?: string
          tournament_id: string
          winner_id?: string | null
        }
        Update: {
          battle_id?: string | null
          created_at?: string
          host_id?: string | null
          id?: string
          next_match_id?: string | null
          next_slot?: number | null
          opponent_id?: string | null
          round?: number
          slot?: number
          status?: string
          tournament_id?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_matches_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "live_battles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_next_match_id_fkey"
            columns: ["next_match_id"]
            isOneToOne: false
            referencedRelation: "tournament_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          category_slug: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          current_round: number
          duration_seconds: number
          id: string
          region: string | null
          size: number
          status: string
          title: string
          winner_id: string | null
        }
        Insert: {
          category_slug?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          current_round?: number
          duration_seconds?: number
          id?: string
          region?: string | null
          size: number
          status?: string
          title: string
          winner_id?: string | null
        }
        Update: {
          category_slug?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          current_round?: number
          duration_seconds?: number
          id?: string
          region?: string | null
          size?: number
          status?: string
          title?: string
          winner_id?: string | null
        }
        Relationships: []
      }
      user_legal_acceptances: {
        Row: {
          accepted_at: string
          doc_slug: string
          id: string
          last_updated: string | null
          source: string | null
          user_agent: string | null
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          doc_slug: string
          id?: string
          last_updated?: string | null
          source?: string | null
          user_agent?: string | null
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          doc_slug?: string
          id?: string
          last_updated?: string | null
          source?: string | null
          user_agent?: string | null
          user_id?: string
          version?: string
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
          role: Database["public"]["Enums"]["app_role"]
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
      user_strikes: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          issued_by: string
          metadata: Json
          reason: string
          severity: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_by: string
          metadata?: Json
          reason: string
          severity?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_by?: string
          metadata?: Json
          reason?: string
          severity?: string
          user_id?: string
        }
        Relationships: []
      }
      verification_requests: {
        Row: {
          brand_name: string | null
          business_document_path: string | null
          category: string
          created_at: string
          follower_count: number | null
          id: string
          id_document_path: string | null
          legal_name: string
          plan: Database["public"]["Enums"]["verification_plan_type"]
          reason: string
          review_notes: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          selfie_path: string | null
          social_links: Json
          status: Database["public"]["Enums"]["verification_status"]
          subscription_active: boolean
          subscription_id: string | null
          subscription_renews_at: string | null
          updated_at: string
          user_id: string
          website_url: string | null
        }
        Insert: {
          brand_name?: string | null
          business_document_path?: string | null
          category: string
          created_at?: string
          follower_count?: number | null
          id?: string
          id_document_path?: string | null
          legal_name: string
          plan: Database["public"]["Enums"]["verification_plan_type"]
          reason: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          selfie_path?: string | null
          social_links?: Json
          status?: Database["public"]["Enums"]["verification_status"]
          subscription_active?: boolean
          subscription_id?: string | null
          subscription_renews_at?: string | null
          updated_at?: string
          user_id: string
          website_url?: string | null
        }
        Update: {
          brand_name?: string | null
          business_document_path?: string | null
          category?: string
          created_at?: string
          follower_count?: number | null
          id?: string
          id_document_path?: string | null
          legal_name?: string
          plan?: Database["public"]["Enums"]["verification_plan_type"]
          reason?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          selfie_path?: string | null
          social_links?: Json
          status?: Database["public"]["Enums"]["verification_status"]
          subscription_active?: boolean
          subscription_id?: string | null
          subscription_renews_at?: string | null
          updated_at?: string
          user_id?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      votes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
          vote_type: Database["public"]["Enums"]["vote_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
          vote_type: Database["public"]["Enums"]["vote_type"]
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
          vote_type?: Database["public"]["Enums"]["vote_type"]
        }
        Relationships: [
          {
            foreignKeyName: "votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          created_at: string
          id: string
          shekel_balance: number
          total_earned: number
          total_spent: number
          updated_at: string
          usd_balance: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          shekel_balance?: number
          total_earned?: number
          total_spent?: number
          updated_at?: string
          usd_balance?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          shekel_balance?: number
          total_earned?: number
          total_spent?: number
          updated_at?: string
          usd_balance?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      gift_transactions_public: {
        Row: {
          created_at: string | null
          gift_id: string | null
          gift_name: string | null
          id: string | null
          post_id: string | null
          quantity: number | null
          receiver_id: string | null
          sender_id: string | null
          total_shekels: number | null
        }
        Insert: {
          created_at?: string | null
          gift_id?: string | null
          gift_name?: string | null
          id?: string | null
          post_id?: string | null
          quantity?: number | null
          receiver_id?: string | null
          sender_id?: string | null
          total_shekels?: number | null
        }
        Update: {
          created_at?: string | null
          gift_id?: string | null
          gift_name?: string | null
          id?: string | null
          post_id?: string | null
          quantity?: number | null
          receiver_id?: string | null
          sender_id?: string | null
          total_shekels?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_transactions_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_transactions_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trending_hashtags: {
        Row: {
          last_used_at: string | null
          post_count: number | null
          score: number | null
          tag: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _notify_live_battle: {
        Args: {
          _battle_id: string
          _body: string
          _kind: string
          _payload?: Json
          _title: string
          _user_id: string
        }
        Returns: undefined
      }
      accept_battle: {
        Args: { _battle_id: string; _opponent_post_id: string }
        Returns: undefined
      }
      admin_broadcast_notification: {
        Args: {
          _body: string
          _link?: string
          _only_active_days?: number
          _title: string
        }
        Returns: number
      }
      admin_decide_sensitive_appeal: {
        Args: { _appeal_id: string; _decision: string; _notes?: string }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_type: string
          id: string
          moderator_notes: string | null
          post_id: string | null
          status: Database["public"]["Enums"]["sensitive_appeal_status"]
          updated_at: string
          user_id: string
          user_statement: string
        }
        SetofOptions: {
          from: "*"
          to: "sensitive_appeals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_decide_verification: {
        Args: {
          _decision: Database["public"]["Enums"]["verification_status"]
          _notes: string
          _request_id: string
        }
        Returns: undefined
      }
      admin_hide_live_battle_comment: {
        Args: { _comment_id: string; _hide: boolean; _reason?: string }
        Returns: undefined
      }
      admin_list_boost_bundles: {
        Args: never
        Returns: {
          active: boolean
          boost_type: string
          created_at: string
          duration_hours: number
          id: string
          label: string
          sort_order: number
          stripe_price_id: string
          usd: number
        }[]
        SetofOptions: {
          from: "*"
          to: "boost_bundles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_live_battle_reports: {
        Args: { _limit?: number; _offset?: number; _status?: string }
        Returns: {
          battle_category: string
          battle_host_id: string
          battle_id: string
          battle_opponent_id: string
          battle_region: string
          battle_room: string
          battle_status: string
          created_at: string
          handled_at: string
          handled_by: string
          id: string
          reason: string
          reporter_id: string
          reporter_photo: string
          reporter_username: string
          status: string
          total_open: number
        }[]
      }
      admin_list_moderation_posts: {
        Args: { _kind: string; _limit?: number }
        Returns: {
          caption: string
          content_rating: string
          created_at: string
          id: string
          is_sensitive: boolean
          moderated_at: string
          moderated_by: string
          moderation_notes: string
          moderation_status: string
          sensitive_reason: string
          user_id: string
        }[]
      }
      admin_list_royal_pass_plans: {
        Args: never
        Returns: {
          active: boolean
          created_at: string
          description: string
          id: string
          interval: string
          name: string
          sort_order: number
          stripe_price_id: string
          updated_at: string
          usd: number
        }[]
        SetofOptions: {
          from: "*"
          to: "royal_pass_plans"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_shekel_bundles: {
        Args: never
        Returns: {
          active: boolean
          created_at: string
          id: string
          label: string
          shekels: number
          sort_order: number
          stripe_price_id: string
          usd: number
        }[]
        SetofOptions: {
          from: "*"
          to: "shekel_bundles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_users: {
        Args: { _limit?: number; _query?: string }
        Returns: {
          banned_at: string
          banned_by: string
          banned_reason: string
          city: string
          country: string
          created_at: string
          deactivated_at: string
          deletion_requested_at: string
          followers_count: number
          id: string
          is_banned: boolean
          is_suspended: boolean
          username: string
        }[]
      }
      admin_moderate_comment: {
        Args: { _comment_id: string; _removed: boolean }
        Returns: undefined
      }
      admin_moderate_post: {
        Args: {
          _content_rating?: string
          _is_removed?: boolean
          _moderation_notes?: string
          _moderation_status: string
          _post_id: string
          _sensitive_reason?: string
        }
        Returns: undefined
      }
      admin_platform_health_summary: { Args: never; Returns: Json }
      admin_set_creator_reward: {
        Args: { _reward_id: string; _status: string }
        Returns: {
          created_at: string
          creator_id: string
          granted_at: string | null
          granted_by: string | null
          id: string
          metadata: Json
          milestone_key: string
          revoked_at: string | null
          reward_type: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "creator_rewards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_creator_status: {
        Args: { _reason?: string; _status: string; _user_id: string }
        Returns: {
          application_note: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          referral_code: string | null
          rejected_reason: string | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "creator_programs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_founder_program: {
        Args: { _active: boolean; _end_at: string; _member_cap: number }
        Returns: Json
      }
      admin_set_post_removed: {
        Args: { _post_id: string; _removed: boolean }
        Returns: undefined
      }
      admin_set_prize_stock: {
        Args: { _id: string; _stock: number }
        Returns: undefined
      }
      admin_set_profile_verified: {
        Args: { _plan?: string; _user_id: string; _verified: boolean }
        Returns: undefined
      }
      admin_storage_usage: {
        Args: never
        Returns: {
          bucket_id: string
          last_upload: string
          object_count: number
          total_bytes: number
        }[]
      }
      admin_update_live_battle_report_status: {
        Args: { _report_id: string; _status: string }
        Returns: {
          battle_id: string
          created_at: string
          handled_at: string | null
          handled_by: string | null
          id: string
          reason: string
          reporter_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "live_battle_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update_post: {
        Args: { _patch: Json; _post_id: string }
        Returns: undefined
      }
      admin_update_posts_bulk: {
        Args: { _patch: Json; _post_ids: string[] }
        Returns: number
      }
      admin_upsert_spin_prize: {
        Args: {
          _active: boolean
          _color_hex: string
          _id: string
          _label: string
          _prize_type: string
          _prize_value: number
          _sort_order: number
          _weight: number
        }
        Returns: string
      }
      admin_user_growth_summary: { Args: never; Returns: Json }
      apply_to_creator_program: {
        Args: { _note?: string }
        Returns: {
          application_note: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          referral_code: string | null
          rejected_reason: string | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "creator_programs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assert_security_invariants: { Args: never; Returns: undefined }
      assumption: { Args: { _default?: number; _key: string }; Returns: number }
      broadcast_live_battle_typing: {
        Args: { _battle_id: string }
        Returns: boolean
      }
      bump_filter_streak: {
        Args: { _filter: string }
        Returns: {
          current_streak: number
          filter: string
          id: string
          last_vote_date: string
          longest_streak: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "filter_streaks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bump_live_battle_peak_viewers: {
        Args: { _battle_id: string }
        Returns: number
      }
      can_view_posts_of: { Args: { _owner: string }; Returns: boolean }
      cancel_account_deletion: { Args: never; Returns: undefined }
      capture_db_health_snapshot: { Args: never; Returns: string }
      check_repost_eligibility: {
        Args: { p_parent_post_id: string }
        Returns: Json
      }
      claim_daily_reward: { Args: never; Returns: Json }
      claim_daily_royal_boost: { Args: { p_post_id: string }; Returns: Json }
      cleanup_orphaned_media: {
        Args: { p_older_than_minutes?: number }
        Returns: number
      }
      cleanup_orphaned_media_global: {
        Args: { p_older_than_minutes?: number }
        Returns: number
      }
      cleanup_rate_limits: { Args: never; Returns: undefined }
      comments_allowed_on: { Args: { _post: string }; Returns: boolean }
      compute_daily_usage_rollup: { Args: { _d?: string }; Returns: undefined }
      confirm_my_age: { Args: { _dob: string }; Returns: undefined }
      count_post_votes_by_type: {
        Args: { _post_ids: string[]; _vote_type: string }
        Returns: number
      }
      create_battle_challenge: {
        Args: {
          _challenger_post_id: string
          _duration_seconds: number
          _opponent_id: string
        }
        Returns: string
      }
      create_live_battle: {
        Args: {
          _category_slug?: string
          _duration_seconds?: number
          _opponent_id: string
          _region?: string
        }
        Returns: {
          category_slug: string | null
          comments_locked: boolean
          created_at: string
          duration_seconds: number
          ended_reason: string | null
          ends_at: string | null
          force_ended_by: string | null
          go_live_at: string | null
          host_id: string
          host_ready: boolean
          host_votes: number
          id: string
          is_hidden: boolean
          keyword_filters: Json
          lobby_opened_at: string | null
          opponent_id: string
          opponent_ready: boolean
          opponent_votes: number
          peak_viewers: number
          region: string | null
          room_name: string
          scheduled_start_at: string | null
          slow_mode_seconds: number
          started_at: string | null
          status: string
          updated_at: string
          winner_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "live_battles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_rematch: {
        Args: { _battle_id: string }
        Returns: {
          category_slug: string | null
          comments_locked: boolean
          created_at: string
          duration_seconds: number
          ended_reason: string | null
          ends_at: string | null
          force_ended_by: string | null
          go_live_at: string | null
          host_id: string
          host_ready: boolean
          host_votes: number
          id: string
          is_hidden: boolean
          keyword_filters: Json
          lobby_opened_at: string | null
          opponent_id: string
          opponent_ready: boolean
          opponent_votes: number
          peak_viewers: number
          region: string | null
          room_name: string
          scheduled_start_at: string | null
          slow_mode_seconds: number
          started_at: string | null
          status: string
          updated_at: string
          winner_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "live_battles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_repost: {
        Args: {
          p_caption?: string
          p_parent_post_id: string
          p_request_id?: string
        }
        Returns: Json
      }
      create_tournament: {
        Args: {
          _category_slug?: string
          _duration_seconds?: number
          _participants: string[]
          _region?: string
          _size: number
          _title: string
        }
        Returns: {
          category_slug: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          current_round: number
          duration_seconds: number
          id: string
          region: string | null
          size: number
          status: string
          title: string
          winner_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tournaments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      deactivate_my_account: { Args: never; Returns: undefined }
      decline_battle: { Args: { _battle_id: string }; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      dm_pair_folder: { Args: { _a: string; _b: string }; Returns: string }
      dm_typing_topic_allowed: { Args: { _topic: string }; Returns: boolean }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enforce_rate_limit: {
        Args: {
          _action_key: string
          _max_count: number
          _window_seconds: number
        }
        Returns: undefined
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_my_wallet: { Args: never; Returns: undefined }
      evaluate_cost_alerts: { Args: never; Returns: number }
      evaluate_creator_milestones: {
        Args: { _creator_id: string }
        Returns: undefined
      }
      founder_program_public_status: { Args: never; Returns: Json }
      get_battle_official_result: {
        Args: { _battle_id: string }
        Returns: Json
      }
      get_battler_battle_analytics: {
        Args: { _limit?: number; _user_id: string }
        Returns: Json
      }
      get_category_leaderboard: {
        Args: {
          _limit?: number
          _main_slug: string
          _period?: Database["public"]["Enums"]["ranking_period"]
          _scope_type?: Database["public"]["Enums"]["ranking_scope"]
          _scope_value?: string
          _sub_slug?: string
        }
        Returns: {
          city: string
          country: string
          crowns_held: number
          prev_rank: number
          profile_photo_url: string
          rank: number
          score: number
          snapshot_at: string
          state: string
          user_id: string
          username: string
          votes: number
        }[]
      }
      get_creator_dashboard: { Args: { _user_id?: string }; Returns: Json }
      get_crown_map_public_points: {
        Args: { _category?: string; _limit?: number; _region_type?: string }
        Returns: {
          category: string
          coarse_lat: number
          coarse_lng: number
          crown_count: number
          post_count: number
          rank: number
          refreshed_at: string
          region_name: string
          region_type: string
          score: number
        }[]
      }
      get_crowned_post_map_points: {
        Args: { _category?: string; _limit?: number; _region_type?: string }
        Returns: {
          category: string
          city: string
          country: string
          lat: number
          lng: number
          location_precision: string
          metadata: Json
          post_id: string
          rank: number
          refreshed_at: string
          region_name: string
          region_type: string
          score: number
          state: string
        }[]
      }
      get_db_vitals: { Args: never; Returns: Json }
      get_live_battle_comments: {
        Args: { _battle_id: string; _before?: string; _limit?: number }
        Returns: {
          battle_id: string
          body: string
          created_at: string
          hidden_at: string
          id: string
          user_id: string
        }[]
      }
      get_live_battle_highlight: { Args: { _battle_id: string }; Returns: Json }
      get_live_battle_vote_timeline: {
        Args: { _battle_id: string }
        Returns: Json
      }
      get_my_admin_roles: {
        Args: never
        Returns: {
          role: string
        }[]
      }
      get_my_crown_map_points: {
        Args: never
        Returns: {
          category: string | null
          city: string | null
          country: string | null
          crown_id: string | null
          id: string
          lat: number | null
          lng: number | null
          location_precision: string
          location_source: string | null
          metadata: Json
          post_id: string | null
          rank: number | null
          refreshed_at: string
          region_name: string | null
          region_type: string
          score: number
          state: string | null
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "crown_map_points"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_profile: {
        Args: never
        Returns: {
          auto_accept_battles_from_follows: boolean
          autoplay_cellular: boolean
          autosave_to_camera_roll: boolean
          avatar_position_y: number
          banned_at: string | null
          banned_by: string | null
          banned_reason: string | null
          banner_position_y: number
          banner_url: string | null
          battle_wins: number
          bio: string | null
          boost_tokens_balance: number
          captions_default_on: boolean
          city: string | null
          country: string | null
          created_at: string
          crown_score: number
          crowns_held: number
          crowns_total: number
          deactivated_at: string | null
          default_battle_stake: number
          default_category: string | null
          default_comments_enabled: boolean
          default_post_visibility: string
          default_race_scope: string
          deletion_requested_at: string | null
          first_name: string | null
          followers_count: number
          following_count: number
          founder_granted_at: string | null
          founder_title: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          hide_comments: boolean
          hide_likes: boolean
          hide_views: boolean
          high_contrast: boolean
          id: string
          is_banned: boolean
          is_founder: boolean
          is_private: boolean
          is_suspended: boolean
          larger_text: boolean
          last_name: string | null
          liked_posts_public: boolean
          links: Json
          locale: string
          posts_visibility: string
          profile_photo_url: string | null
          pronouns: string | null
          push_battles: boolean
          push_comments: boolean
          push_follows: boolean
          push_likes: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          reduce_motion: boolean
          royal_frame_variant: string | null
          sensitive_content_mode: string
          state: string | null
          tag_review_required: boolean
          timezone: string | null
          updated_at: string
          username: string
          verification_plan: string | null
          verified: boolean
          verified_at: string | null
          vote_privacy: string
          votes_given: number
          votes_received: number
          watermark_enabled: boolean
          who_can_dm: string
          who_can_mention: string
          who_can_tag: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_my_profile_sensitive: {
        Args: never
        Returns: {
          dob: string
          email: string
        }[]
      }
      get_my_unread_dm_counts: { Args: never; Returns: Json }
      get_my_unread_notification_counts: { Args: never; Returns: Json }
      get_or_create_my_invite_code: { Args: never; Returns: string }
      get_post_public_voters: {
        Args: { _limit?: number; _post_id: string }
        Returns: {
          created_at: string
          profile_photo_url: string
          user_id: string
          username: string
          vote_type: string
        }[]
      }
      get_post_share_status: { Args: { _post_id: string }; Returns: string }
      get_post_vote_stats: { Args: { _post_id: string }; Returns: Json }
      get_user_liked_post_ids: {
        Args: { _limit?: number; _user_id: string }
        Returns: {
          created_at: string
          post_id: string
        }[]
      }
      grant_pass_invite_bonus: {
        Args: { _user_id: string }
        Returns: undefined
      }
      grant_royal_monthly_benefits: {
        Args: {
          _paid_amount_cents: number
          _period_end: string
          _period_start: string
          _stripe_charge_id?: string
          _stripe_event_id: string
          _stripe_invoice_id: string
          _stripe_payment_intent_id?: string
          _stripe_subscription_id?: string
          _user_id: string
        }
        Returns: Json
      }
      handle_royal_dispute_created: {
        Args: {
          _dispute_reason?: string
          _stripe_charge_id?: string
          _stripe_dispute_id: string
          _stripe_event_id: string
          _stripe_invoice_id?: string
          _stripe_payment_intent_id?: string
        }
        Returns: Json
      }
      handle_royal_dispute_funds_withdrawn: {
        Args: {
          _stripe_charge_id?: string
          _stripe_dispute_id: string
          _stripe_event_id: string
          _stripe_invoice_id?: string
          _stripe_payment_intent_id?: string
        }
        Returns: Json
      }
      handle_royal_dispute_lost: {
        Args: {
          _reason?: string
          _stripe_charge_id?: string
          _stripe_dispute_id: string
          _stripe_event_id: string
          _stripe_invoice_id?: string
          _stripe_payment_intent_id?: string
        }
        Returns: Json
      }
      handle_royal_dispute_reinstated: {
        Args: {
          _stripe_charge_id?: string
          _stripe_dispute_id?: string
          _stripe_event_id: string
          _stripe_invoice_id?: string
          _stripe_payment_intent_id?: string
        }
        Returns: Json
      }
      handle_royal_dispute_won: {
        Args: {
          _stripe_charge_id?: string
          _stripe_dispute_id: string
          _stripe_event_id: string
          _stripe_invoice_id?: string
          _stripe_payment_intent_id?: string
        }
        Returns: Json
      }
      handle_royal_refund: {
        Args: {
          _new_status?: string
          _reason: string
          _stripe_charge_id?: string
          _stripe_event_id: string
          _stripe_invoice_id?: string
          _stripe_payment_intent_id?: string
        }
        Returns: Json
      }
      has_active_boost: {
        Args: { _boost_type: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      invite_leaderboard:
        | { Args: { _limit?: number; _scope?: string }; Returns: Json }
        | {
            Args: { _limit?: number; _mode?: string; _scope?: string }
            Returns: Json
          }
      is_any_admin: { Args: { _uid: string }; Returns: boolean }
      is_battle_eligible_post: {
        Args: { _owner_id: string; _post_id: string }
        Returns: boolean
      }
      is_challengeable_user: {
        Args: { _target: string; _viewer: string }
        Returns: boolean
      }
      is_feature_enabled: { Args: { _key: string }; Returns: boolean }
      is_royal_pass_active: { Args: { _user_id: string }; Returns: boolean }
      is_thread_muted: {
        Args: { _post_id: string; _user_id: string }
        Returns: boolean
      }
      live_battle_accept: {
        Args: { _battle_id: string }
        Returns: {
          category_slug: string | null
          comments_locked: boolean
          created_at: string
          duration_seconds: number
          ended_reason: string | null
          ends_at: string | null
          force_ended_by: string | null
          go_live_at: string | null
          host_id: string
          host_ready: boolean
          host_votes: number
          id: string
          is_hidden: boolean
          keyword_filters: Json
          lobby_opened_at: string | null
          opponent_id: string
          opponent_ready: boolean
          opponent_votes: number
          peak_viewers: number
          region: string | null
          room_name: string
          scheduled_start_at: string | null
          slow_mode_seconds: number
          started_at: string | null
          status: string
          updated_at: string
          winner_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "live_battles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      live_battle_body_matches_keyword: {
        Args: { _battle_id: string; _body: string }
        Returns: boolean
      }
      live_battle_cancel: {
        Args: { _battle_id: string }
        Returns: {
          category_slug: string | null
          comments_locked: boolean
          created_at: string
          duration_seconds: number
          ended_reason: string | null
          ends_at: string | null
          force_ended_by: string | null
          go_live_at: string | null
          host_id: string
          host_ready: boolean
          host_votes: number
          id: string
          is_hidden: boolean
          keyword_filters: Json
          lobby_opened_at: string | null
          opponent_id: string
          opponent_ready: boolean
          opponent_votes: number
          peak_viewers: number
          region: string | null
          room_name: string
          scheduled_start_at: string | null
          slow_mode_seconds: number
          started_at: string | null
          status: string
          updated_at: string
          winner_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "live_battles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      live_battle_decline: {
        Args: { _battle_id: string }
        Returns: {
          category_slug: string | null
          comments_locked: boolean
          created_at: string
          duration_seconds: number
          ended_reason: string | null
          ends_at: string | null
          force_ended_by: string | null
          go_live_at: string | null
          host_id: string
          host_ready: boolean
          host_votes: number
          id: string
          is_hidden: boolean
          keyword_filters: Json
          lobby_opened_at: string | null
          opponent_id: string
          opponent_ready: boolean
          opponent_votes: number
          peak_viewers: number
          region: string | null
          room_name: string
          scheduled_start_at: string | null
          slow_mode_seconds: number
          started_at: string | null
          status: string
          updated_at: string
          winner_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "live_battles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      live_battle_end: {
        Args: { _battle_id: string; _force?: boolean; _reason?: string }
        Returns: {
          category_slug: string | null
          comments_locked: boolean
          created_at: string
          duration_seconds: number
          ended_reason: string | null
          ends_at: string | null
          force_ended_by: string | null
          go_live_at: string | null
          host_id: string
          host_ready: boolean
          host_votes: number
          id: string
          is_hidden: boolean
          keyword_filters: Json
          lobby_opened_at: string | null
          opponent_id: string
          opponent_ready: boolean
          opponent_votes: number
          peak_viewers: number
          region: string | null
          room_name: string
          scheduled_start_at: string | null
          slow_mode_seconds: number
          started_at: string | null
          status: string
          updated_at: string
          winner_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "live_battles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      live_battle_log_action: {
        Args: { _action: string; _battle_id: string; _target: string }
        Returns: undefined
      }
      live_battle_report: {
        Args: { _battle_id: string; _reason: string }
        Returns: {
          battle_id: string
          created_at: string
          handled_at: string | null
          handled_by: string | null
          id: string
          reason: string
          reporter_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "live_battle_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      live_battle_send_emote: {
        Args: { _battle_id: string; _kind: string }
        Returns: undefined
      }
      live_battle_start: {
        Args: { _battle_id: string }
        Returns: {
          category_slug: string | null
          comments_locked: boolean
          created_at: string
          duration_seconds: number
          ended_reason: string | null
          ends_at: string | null
          force_ended_by: string | null
          go_live_at: string | null
          host_id: string
          host_ready: boolean
          host_votes: number
          id: string
          is_hidden: boolean
          keyword_filters: Json
          lobby_opened_at: string | null
          opponent_id: string
          opponent_ready: boolean
          opponent_votes: number
          peak_viewers: number
          region: string | null
          room_name: string
          scheduled_start_at: string | null
          slow_mode_seconds: number
          started_at: string | null
          status: string
          updated_at: string
          winner_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "live_battles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      live_battle_viewer_count: {
        Args: { _battle_id: string }
        Returns: number
      }
      live_battle_viewer_heartbeat: {
        Args: { _battle_id: string }
        Returns: undefined
      }
      live_battle_vote: {
        Args: { _battle_id: string; _choice: string }
        Returns: undefined
      }
      log_upload_monitoring_event: {
        Args: {
          _context?: Json
          _event: string
          _message: string
          _user_id: string
        }
        Returns: undefined
      }
      mark_all_messages_read: { Args: never; Returns: number }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_dm_gift_seen: { Args: { p_message_id: string }; Returns: undefined }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_repost_category_pair: {
        Args: { p_main: string; p_sub: string }
        Returns: {
          main_slug: string
          sub_slug: string
        }[]
      }
      notif_pref: {
        Args: { _kind: string; _user_id: string }
        Returns: boolean
      }
      profile_change_allowed: {
        Args: { p_change_type: string; p_max_per_hour?: number }
        Returns: boolean
      }
      prune_logs_retention: { Args: never; Returns: Json }
      prune_rank_snapshots: { Args: never; Returns: undefined }
      publish_post_idempotent: {
        Args: { p_client_request_id: string; p_payload: Json }
        Returns: {
          ai_searchable_text: string | null
          ai_suggested_main_category_slug: string | null
          alt_texts: string[]
          archived_at: string | null
          aspect_ratio: string | null
          battle_wins: number
          caption: string | null
          category: Database["public"]["Enums"]["crown_category"]
          city: string | null
          client_request_id: string | null
          comment_count: number
          content_rating: Database["public"]["Enums"]["content_rating"]
          content_type: string
          country: string | null
          created_at: string
          crown_score: number
          crown_shield_until: string | null
          duration_ms: number | null
          edited_at: string | null
          filter: string | null
          filter_type: string | null
          hashtags: string[]
          id: string
          image_url: string
          image_urls: string[]
          is_archived: boolean
          is_removed: boolean
          is_sensitive: boolean
          location_captured_at: string | null
          location_enabled: boolean
          location_label: string | null
          location_source: string | null
          main_category_slug: string | null
          media_height: number | null
          media_origin: string | null
          media_type: string
          media_width: number | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_notes: string | null
          moderation_status: Database["public"]["Enums"]["moderation_status"]
          parent_post_id: string | null
          photo_filter: string | null
          pinned_at: string | null
          post_lat: number | null
          post_lng: number | null
          post_location_precision: string
          publish_status: string
          region_name: string | null
          region_type: string | null
          repost_caption: string | null
          repost_count: number
          royal_boost_until: string | null
          scheduled_for: string | null
          sensitive_reason: string | null
          share_count: number
          spotlight_until: string | null
          state: string | null
          subcategory_slug: string | null
          submission_key: string | null
          tagged_user_ids: string[]
          user_id: string
          video_filter: string | null
          video_poster_url: string | null
          video_url: string | null
          vote_boost_until: string | null
          vote_count: number
        }
        SetofOptions: {
          from: "*"
          to: "posts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      purchase_boost: {
        Args: {
          p_boost_type: string
          p_cost_shekels?: number
          p_duration_hours?: number
          p_post_id?: string
        }
        Returns: Json
      }
      qual_or_check_contains: {
        Args: { _haystack: string; _needle: string }
        Returns: boolean
      }
      reactivate_my_account: { Args: never; Returns: undefined }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recalc_post_score: { Args: { _post_id: string }; Returns: undefined }
      recalculate_all_repost_counts: { Args: never; Returns: number }
      recalculate_repost_count: { Args: { _post_id: string }; Returns: number }
      record_profile_visit: {
        Args: { _profile_id: string }
        Returns: undefined
      }
      redeem_invite_code: { Args: { _code: string }; Returns: Json }
      refresh_crown_map_points: { Args: never; Returns: number }
      refresh_crowns_for_post: {
        Args: { _post_id: string }
        Returns: undefined
      }
      request_account_deletion: { Args: never; Returns: Json }
      request_standard_verification: { Args: never; Returns: Json }
      resolve_tournament_match: {
        Args: { _match_id: string; _winner_id: string }
        Returns: {
          battle_id: string | null
          created_at: string
          host_id: string | null
          id: string
          next_match_id: string | null
          next_slot: number | null
          opponent_id: string | null
          round: number
          slot: number
          status: string
          tournament_id: string
          winner_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tournament_matches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_founder_for_refund: {
        Args: { _reason: string; _stripe_invoice_id: string; _user_id: string }
        Returns: Json
      }
      revoke_royal_founder: {
        Args: {
          _actor_id?: string
          _mode?: string
          _reason: string
          _stripe_dispute_id?: string
          _stripe_event_id: string
          _user_id: string
        }
        Returns: Json
      }
      royal_entitlements: { Args: never; Returns: Json }
      royal_pass_daily_boost_status: { Args: never; Returns: Json }
      royal_wave82a_dispute_match_selftest: {
        Args: never
        Returns: {
          grant_status_after: string
          ok: boolean
          result: Json
          scenario: string
        }[]
      }
      royal_wave82a_race_call:
        | {
            Args: {
              _evt: string
              _period_end: string
              _period_start: string
              _uid: string
            }
            Returns: Json
          }
        | {
            Args: {
              _barrier_key: number
              _event_id: string
              _period_end: string
              _period_start: string
              _user_id: string
            }
            Returns: Json
          }
      royal_wave82a_race_cleanup: { Args: { _uid: string }; Returns: undefined }
      royal_wave82a_race_seed: { Args: never; Returns: string }
      royal_wave82a_race_setup: { Args: { _uid: string }; Returns: undefined }
      royal_wave82a_shield_selftest: {
        Args: never
        Returns: {
          boost_created: boolean
          boost_source: string
          result: Json
          scenario: string
          shields_used_after: number
        }[]
      }
      save_push_subscription: {
        Args: {
          _auth: string
          _endpoint: string
          _p256dh: string
          _user_agent: string
        }
        Returns: string
      }
      schedule_live_battle: {
        Args: {
          _category_slug?: string
          _duration_seconds?: number
          _opponent_id: string
          _region?: string
          _scheduled_start_at: string
        }
        Returns: {
          category_slug: string | null
          comments_locked: boolean
          created_at: string
          duration_seconds: number
          ended_reason: string | null
          ends_at: string | null
          force_ended_by: string | null
          go_live_at: string | null
          host_id: string
          host_ready: boolean
          host_votes: number
          id: string
          is_hidden: boolean
          keyword_filters: Json
          lobby_opened_at: string | null
          opponent_id: string
          opponent_ready: boolean
          opponent_votes: number
          peak_viewers: number
          region: string | null
          room_name: string
          scheduled_start_at: string | null
          slow_mode_seconds: number
          started_at: string | null
          status: string
          updated_at: string
          winner_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "live_battles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_public_posts: {
        Args: { _limit?: number; _offset?: number; _query: string }
        Returns: {
          caption: string
          category: string
          city: string
          comment_count: number
          content_type: string
          country: string
          created_at: string
          crown_score: number
          id: string
          image_url: string
          image_urls: string[]
          main_category_slug: string
          media_type: string
          repost_count: number
          state: string
          subcategory_slug: string
          user_id: string
          video_poster_url: string
          vote_count: number
        }[]
      }
      send_dm_gift: {
        Args: {
          p_dedupe_key?: string
          p_gift_id: string
          p_quantity: number
          p_recipient_id: string
        }
        Returns: Json
      }
      send_dm_share: {
        Args: {
          p_body?: string
          p_dedupe_key?: string
          p_kind: string
          p_post_id?: string
          p_profile_id?: string
          p_recipient_id: string
        }
        Returns: Json
      }
      send_live_battle_gift: {
        Args: {
          _battle_id: string
          _dedupe_key?: string
          _gift_id: string
          _quantity?: number
          _recipient_id: string
        }
        Returns: Json
      }
      send_royal_gift: {
        Args: {
          p_dedupe_key?: string
          p_gift_id: string
          p_post_id: string
          p_quantity: number
          p_recipient_id: string
        }
        Returns: Json
      }
      set_battle_moderation: {
        Args: {
          _battle_id: string
          _comments_locked: boolean
          _keyword_filters: Json
          _slow_mode_seconds: number
        }
        Returns: {
          category_slug: string | null
          comments_locked: boolean
          created_at: string
          duration_seconds: number
          ended_reason: string | null
          ends_at: string | null
          force_ended_by: string | null
          go_live_at: string | null
          host_id: string
          host_ready: boolean
          host_votes: number
          id: string
          is_hidden: boolean
          keyword_filters: Json
          lobby_opened_at: string | null
          opponent_id: string
          opponent_ready: boolean
          opponent_votes: number
          peak_viewers: number
          region: string | null
          room_name: string
          scheduled_start_at: string | null
          slow_mode_seconds: number
          started_at: string | null
          status: string
          updated_at: string
          winner_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "live_battles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_lobby_ready: {
        Args: { _battle_id: string; _ready: boolean }
        Returns: {
          category_slug: string | null
          comments_locked: boolean
          created_at: string
          duration_seconds: number
          ended_reason: string | null
          ends_at: string | null
          force_ended_by: string | null
          go_live_at: string | null
          host_id: string
          host_ready: boolean
          host_votes: number
          id: string
          is_hidden: boolean
          keyword_filters: Json
          lobby_opened_at: string | null
          opponent_id: string
          opponent_ready: boolean
          opponent_votes: number
          peak_viewers: number
          region: string | null
          room_name: string
          scheduled_start_at: string | null
          slow_mode_seconds: number
          started_at: string | null
          status: string
          updated_at: string
          winner_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "live_battles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      snapshot_category_ranks: { Args: never; Returns: undefined }
      snapshot_post_ranks: { Args: never; Returns: undefined }
      spin_daily_wheel: { Args: never; Returns: Json }
      start_battle_from_lobby: {
        Args: { _battle_id: string }
        Returns: {
          category_slug: string | null
          comments_locked: boolean
          created_at: string
          duration_seconds: number
          ended_reason: string | null
          ends_at: string | null
          force_ended_by: string | null
          go_live_at: string | null
          host_id: string
          host_ready: boolean
          host_votes: number
          id: string
          is_hidden: boolean
          keyword_filters: Json
          lobby_opened_at: string | null
          opponent_id: string
          opponent_ready: boolean
          opponent_votes: number
          peak_viewers: number
          region: string | null
          room_name: string
          scheduled_start_at: string | null
          slow_mode_seconds: number
          started_at: string | null
          status: string
          updated_at: string
          winner_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "live_battles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_tournament_match: {
        Args: { _match_id: string }
        Returns: {
          category_slug: string | null
          comments_locked: boolean
          created_at: string
          duration_seconds: number
          ended_reason: string | null
          ends_at: string | null
          force_ended_by: string | null
          go_live_at: string | null
          host_id: string
          host_ready: boolean
          host_votes: number
          id: string
          is_hidden: boolean
          keyword_filters: Json
          lobby_opened_at: string | null
          opponent_id: string
          opponent_ready: boolean
          opponent_votes: number
          peak_viewers: number
          region: string | null
          room_name: string
          scheduled_start_at: string | null
          slow_mode_seconds: number
          started_at: string | null
          status: string
          updated_at: string
          winner_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "live_battles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      storage_path_from_public_url: {
        Args: { _bucket: string; _url: string }
        Returns: string
      }
      submit_verification_request: {
        Args: {
          _brand_name: string
          _business_document_path: string
          _category: string
          _follower_count: number
          _id_document_path: string
          _legal_name: string
          _plan: Database["public"]["Enums"]["verification_plan_type"]
          _reason: string
          _selfie_path: string
          _social_links: Json
          _website_url: string
        }
        Returns: string
      }
      undo_repost: { Args: { p_repost_id: string }; Returns: Json }
      update_my_dob: { Args: { _dob: string }; Returns: undefined }
      update_my_preferences: { Args: { _prefs: Json }; Returns: undefined }
      use_royal_shield: { Args: { _post_id: string }; Returns: Json }
      validate_storage_object: {
        Args: {
          _allowed_mimes: string[]
          _bucket: string
          _event: string
          _friendly_msg: string
          _max_bytes: number
          _path: string
        }
        Returns: undefined
      }
      verification_eligibility_progress: {
        Args: { _user_id?: string }
        Returns: Json
      }
      verify_web_push_trigger_secret: {
        Args: { _secret: string }
        Returns: boolean
      }
      withdraw_my_sensitive_appeal: {
        Args: { _appeal_id: string }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_type: string
          id: string
          moderator_notes: string | null
          post_id: string | null
          status: Database["public"]["Enums"]["sensitive_appeal_status"]
          updated_at: string
          user_id: string
          user_statement: string
        }
        SetofOptions: {
          from: "*"
          to: "sensitive_appeals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role:
        | "user"
        | "moderator"
        | "admin"
        | "super_admin"
        | "finance_admin"
        | "security_admin"
        | "content_admin"
        | "support_admin"
      battle_status:
        | "pending"
        | "active"
        | "completed"
        | "declined"
        | "cancelled"
      boost_type:
        | "royal_boost"
        | "vote_boost"
        | "crown_spotlight"
        | "profile_glow"
        | "crown_shield"
      content_rating: "safe" | "suggestive" | "mature" | "explicit"
      crown_category:
        | "overall"
        | "best_style"
        | "most_creative"
        | "most_popular"
        | "best_look"
        | "best_outfit"
        | "best_smile"
        | "best_eyes"
        | "best_hair"
        | "best_glow"
        | "best_makeup"
        | "best_fit"
        | "best_streetwear"
        | "best_formal"
        | "best_swimwear"
        | "best_accessories"
        | "best_shoes"
        | "best_pose"
        | "best_aesthetic"
        | "best_vibe"
        | "best_confidence"
        | "best_glow_up"
        | "best_couple"
        | "best_pet"
        | "best_travel"
        | "best_fitness"
        | "best_throwback"
        | "rising_star"
      gender_type: "male" | "female" | "non_binary" | "prefer_not_to_say"
      moderation_status: "pending" | "approved" | "flagged" | "removed"
      notification_type:
        | "vote"
        | "comment"
        | "follow"
        | "crown_won"
        | "crown_lost"
        | "battle_challenge"
        | "battle_won"
        | "battle_lost"
        | "dm"
        | "system"
        | "dm_gift"
        | "dm_share"
        | "repost"
      ranking_period: "day" | "week" | "month" | "all"
      ranking_scope: "global" | "country" | "state" | "city"
      region_type: "city" | "state" | "country" | "global"
      report_status:
        | "open"
        | "resolved"
        | "dismissed"
        | "action_taken"
        | "denied"
        | "escalated"
      sensitive_appeal_status:
        | "pending"
        | "under_review"
        | "approved"
        | "denied"
        | "withdrawn"
      verification_plan_type: "standard" | "subscription"
      verification_status:
        | "pending"
        | "approved"
        | "rejected"
        | "more_info_required"
        | "revoked"
      vote_type: "crown" | "fire" | "diamond" | "dislike"
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
      app_role: [
        "user",
        "moderator",
        "admin",
        "super_admin",
        "finance_admin",
        "security_admin",
        "content_admin",
        "support_admin",
      ],
      battle_status: [
        "pending",
        "active",
        "completed",
        "declined",
        "cancelled",
      ],
      boost_type: [
        "royal_boost",
        "vote_boost",
        "crown_spotlight",
        "profile_glow",
        "crown_shield",
      ],
      content_rating: ["safe", "suggestive", "mature", "explicit"],
      crown_category: [
        "overall",
        "best_style",
        "most_creative",
        "most_popular",
        "best_look",
        "best_outfit",
        "best_smile",
        "best_eyes",
        "best_hair",
        "best_glow",
        "best_makeup",
        "best_fit",
        "best_streetwear",
        "best_formal",
        "best_swimwear",
        "best_accessories",
        "best_shoes",
        "best_pose",
        "best_aesthetic",
        "best_vibe",
        "best_confidence",
        "best_glow_up",
        "best_couple",
        "best_pet",
        "best_travel",
        "best_fitness",
        "best_throwback",
        "rising_star",
      ],
      gender_type: ["male", "female", "non_binary", "prefer_not_to_say"],
      moderation_status: ["pending", "approved", "flagged", "removed"],
      notification_type: [
        "vote",
        "comment",
        "follow",
        "crown_won",
        "crown_lost",
        "battle_challenge",
        "battle_won",
        "battle_lost",
        "dm",
        "system",
        "dm_gift",
        "dm_share",
        "repost",
      ],
      ranking_period: ["day", "week", "month", "all"],
      ranking_scope: ["global", "country", "state", "city"],
      region_type: ["city", "state", "country", "global"],
      report_status: [
        "open",
        "resolved",
        "dismissed",
        "action_taken",
        "denied",
        "escalated",
      ],
      sensitive_appeal_status: [
        "pending",
        "under_review",
        "approved",
        "denied",
        "withdrawn",
      ],
      verification_plan_type: ["standard", "subscription"],
      verification_status: [
        "pending",
        "approved",
        "rejected",
        "more_info_required",
        "revoked",
      ],
      vote_type: ["crown", "fire", "diamond", "dislike"],
    },
  },
} as const
