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
          actor_id: string
          created_at: string
          details: Json
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id: string
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string
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
      battles: {
        Row: {
          challenger_id: string
          challenger_post_id: string
          challenger_votes: number
          created_at: string
          ends_at: string | null
          id: string
          opponent_id: string
          opponent_post_id: string | null
          opponent_votes: number
          status: Database["public"]["Enums"]["battle_status"]
          winner_id: string | null
        }
        Insert: {
          challenger_id: string
          challenger_post_id: string
          challenger_votes?: number
          created_at?: string
          ends_at?: string | null
          id?: string
          opponent_id: string
          opponent_post_id?: string | null
          opponent_votes?: number
          status?: Database["public"]["Enums"]["battle_status"]
          winner_id?: string | null
        }
        Update: {
          challenger_id?: string
          challenger_post_id?: string
          challenger_votes?: number
          created_at?: string
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
      boosts: {
        Row: {
          active: boolean
          boost_type: Database["public"]["Enums"]["boost_type"]
          expires_at: string | null
          id: string
          post_id: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          boost_type: Database["public"]["Enums"]["boost_type"]
          expires_at?: string | null
          id?: string
          post_id?: string | null
          started_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          boost_type?: Database["public"]["Enums"]["boost_type"]
          expires_at?: string | null
          id?: string
          post_id?: string | null
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
          current_streak: number
          last_claimed_date: string | null
          last_spin_date: string | null
          longest_streak: number
          total_claims: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current_streak?: number
          last_claimed_date?: string | null
          last_spin_date?: string | null
          longest_streak?: number
          total_claims?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current_streak?: number
          last_claimed_date?: string | null
          last_spin_date?: string | null
          longest_streak?: number
          total_claims?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      gift_transactions: {
        Row: {
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
        Relationships: []
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
          id: string
          read: boolean
          receiver_id: string
          sender_id: string
          shared_post_id: string | null
          shared_profile_id: string | null
        }
        Insert: {
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          body?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          read?: boolean
          receiver_id: string
          sender_id: string
          shared_post_id?: string | null
          shared_profile_id?: string | null
        }
        Update: {
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          body?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          read?: boolean
          receiver_id?: string
          sender_id?: string
          shared_post_id?: string | null
          shared_profile_id?: string | null
        }
        Relationships: [
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
      posts: {
        Row: {
          alt_texts: string[]
          archived_at: string | null
          battle_wins: number
          caption: string | null
          category: Database["public"]["Enums"]["crown_category"]
          city: string | null
          comment_count: number
          country: string | null
          created_at: string
          crown_score: number
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
          media_height: number | null
          media_origin: string | null
          media_type: string
          media_width: number | null
          parent_post_id: string | null
          photo_filter: string | null
          pinned_at: string | null
          repost_caption: string | null
          scheduled_for: string | null
          share_count: number
          state: string | null
          submission_key: string | null
          tagged_user_ids: string[]
          user_id: string
          video_filter: string | null
          video_poster_url: string | null
          video_url: string | null
          vote_count: number
        }
        Insert: {
          alt_texts?: string[]
          archived_at?: string | null
          battle_wins?: number
          caption?: string | null
          category?: Database["public"]["Enums"]["crown_category"]
          city?: string | null
          comment_count?: number
          country?: string | null
          created_at?: string
          crown_score?: number
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
          media_height?: number | null
          media_origin?: string | null
          media_type?: string
          media_width?: number | null
          parent_post_id?: string | null
          photo_filter?: string | null
          pinned_at?: string | null
          repost_caption?: string | null
          scheduled_for?: string | null
          share_count?: number
          state?: string | null
          submission_key?: string | null
          tagged_user_ids?: string[]
          user_id: string
          video_filter?: string | null
          video_poster_url?: string | null
          video_url?: string | null
          vote_count?: number
        }
        Update: {
          alt_texts?: string[]
          archived_at?: string | null
          battle_wins?: number
          caption?: string | null
          category?: Database["public"]["Enums"]["crown_category"]
          city?: string | null
          comment_count?: number
          country?: string | null
          created_at?: string
          crown_score?: number
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
          media_height?: number | null
          media_origin?: string | null
          media_type?: string
          media_width?: number | null
          parent_post_id?: string | null
          photo_filter?: string | null
          pinned_at?: string | null
          repost_caption?: string | null
          scheduled_for?: string | null
          share_count?: number
          state?: string | null
          submission_key?: string | null
          tagged_user_ids?: string[]
          user_id?: string
          video_filter?: string | null
          video_poster_url?: string | null
          video_url?: string | null
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
          captions_default_on: boolean
          city: string | null
          country: string | null
          created_at: string
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
          gender: Database["public"]["Enums"]["gender_type"] | null
          hide_comments: boolean
          hide_likes: boolean
          hide_views: boolean
          high_contrast: boolean
          id: string
          is_banned: boolean
          is_private: boolean
          is_suspended: boolean
          larger_text: boolean
          last_name: string | null
          liked_posts_public: boolean
          links: Json
          locale: string
          posts_visibility: string
          profile_photo_url: string | null
          push_battles: boolean
          push_comments: boolean
          push_follows: boolean
          push_likes: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          reduce_motion: boolean
          state: string | null
          tag_review_required: boolean
          timezone: string | null
          updated_at: string
          username: string
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
          captions_default_on?: boolean
          city?: string | null
          country?: string | null
          created_at?: string
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
          gender?: Database["public"]["Enums"]["gender_type"] | null
          hide_comments?: boolean
          hide_likes?: boolean
          hide_views?: boolean
          high_contrast?: boolean
          id: string
          is_banned?: boolean
          is_private?: boolean
          is_suspended?: boolean
          larger_text?: boolean
          last_name?: string | null
          liked_posts_public?: boolean
          links?: Json
          locale?: string
          posts_visibility?: string
          profile_photo_url?: string | null
          push_battles?: boolean
          push_comments?: boolean
          push_follows?: boolean
          push_likes?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          reduce_motion?: boolean
          state?: string | null
          tag_review_required?: boolean
          timezone?: string | null
          updated_at?: string
          username: string
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
          captions_default_on?: boolean
          city?: string | null
          country?: string | null
          created_at?: string
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
          gender?: Database["public"]["Enums"]["gender_type"] | null
          hide_comments?: boolean
          hide_likes?: boolean
          hide_views?: boolean
          high_contrast?: boolean
          id?: string
          is_banned?: boolean
          is_private?: boolean
          is_suspended?: boolean
          larger_text?: boolean
          last_name?: string | null
          liked_posts_public?: boolean
          links?: Json
          locale?: string
          posts_visibility?: string
          profile_photo_url?: string | null
          push_battles?: boolean
          push_comments?: boolean
          push_follows?: boolean
          push_likes?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          reduce_motion?: boolean
          state?: string | null
          tag_review_required?: boolean
          timezone?: string | null
          updated_at?: string
          username?: string
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
      rank_snapshots: {
        Row: {
          captured_at: string
          category: Database["public"]["Enums"]["crown_category"]
          crown_score: number
          id: string
          post_id: string
          rank: number | null
          region: string
          scope: Database["public"]["Enums"]["region_type"]
          total: number
        }
        Insert: {
          captured_at?: string
          category: Database["public"]["Enums"]["crown_category"]
          crown_score?: number
          id?: string
          post_id: string
          rank?: number | null
          region: string
          scope: Database["public"]["Enums"]["region_type"]
          total?: number
        }
        Update: {
          captured_at?: string
          category?: Database["public"]["Enums"]["crown_category"]
          crown_score?: number
          id?: string
          post_id?: string
          rank?: number | null
          region?: string
          scope?: Database["public"]["Enums"]["region_type"]
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
        Relationships: []
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
      can_view_posts_of: { Args: { _owner: string }; Returns: boolean }
      cancel_account_deletion: { Args: never; Returns: undefined }
      claim_daily_reward: { Args: never; Returns: Json }
      comments_allowed_on: { Args: { _post: string }; Returns: boolean }
      confirm_my_age: { Args: { _dob: string }; Returns: undefined }
      deactivate_my_account: { Args: never; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      dm_pair_folder: { Args: { _a: string; _b: string }; Returns: string }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_my_wallet: { Args: never; Returns: undefined }
      evaluate_creator_milestones: {
        Args: { _creator_id: string }
        Returns: undefined
      }
      get_creator_dashboard: { Args: { _user_id?: string }; Returns: Json }
      get_my_profile_sensitive: {
        Args: never
        Returns: {
          dob: string
          email: string
        }[]
      }
      get_or_create_my_invite_code: { Args: never; Returns: string }
      grant_pass_invite_bonus: {
        Args: { _user_id: string }
        Returns: undefined
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
      is_feature_enabled: { Args: { _key: string }; Returns: boolean }
      is_royal_pass_active: { Args: { _user_id: string }; Returns: boolean }
      is_thread_muted: {
        Args: { _post_id: string; _user_id: string }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      notif_pref: {
        Args: { _kind: string; _user_id: string }
        Returns: boolean
      }
      prune_rank_snapshots: { Args: never; Returns: undefined }
      purchase_boost: {
        Args: {
          p_boost_type: string
          p_cost_shekels?: number
          p_duration_hours?: number
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
      redeem_invite_code: { Args: { _code: string }; Returns: Json }
      refresh_crowns_for_post: {
        Args: { _post_id: string }
        Returns: undefined
      }
      request_account_deletion: { Args: never; Returns: Json }
      send_royal_gift: {
        Args: {
          p_gift_id: string
          p_post_id: string
          p_quantity: number
          p_recipient_id: string
        }
        Returns: Json
      }
      spin_daily_wheel: { Args: never; Returns: Json }
      update_my_dob: { Args: { _dob: string }; Returns: undefined }
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
      region_type: "city" | "state" | "country" | "global"
      report_status:
        | "open"
        | "resolved"
        | "dismissed"
        | "action_taken"
        | "denied"
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
      ],
      region_type: ["city", "state", "country", "global"],
      report_status: [
        "open",
        "resolved",
        "dismissed",
        "action_taken",
        "denied",
      ],
      vote_type: ["crown", "fire", "diamond", "dislike"],
    },
  },
} as const
