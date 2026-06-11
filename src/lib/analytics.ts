// Privacy-safe analytics: never sends raw user_id, IP, or UA.
// We hash (user_id || daily salt) client-side so events are pseudonymous and
// unlinkable across days.
import { supabase } from "@/integrations/supabase/client";

type EventName =
  | "vote_cast"
  | "vote_removed"
  | "comment_posted"
  | "post_shared"
  | "post_viewed"
  | "age_gate_viewed"
  | "age_gate_checkbox_toggled"
  | "age_gate_confirmed"
  | "age_gate_blocked_underage"
  | "age_reverify_required"
  | "post_edited"
  | "post_publish_submitted"
  | "post_publish_deduped"
  | "post_edit_conflict"
  | "avatar_replaced"
  | "profile_change_rate_limited"
  | "user_blocked"
  | "user_reported"
  | "comment_fired"
  | "comment_fire_removed"
  | "post_reposted"
  | "post_tagged_people"
  | "post_scheduled"
  | "post_deleted"
  // Cloud Spend usage tracking — fired once per session-screen, never per render
  | "feed_opened"
  | "scrolls_opened"
  | "crown_map_opened"
  | "crown_map_marker_opened"
  | "leaderboard_opened"
  | "profile_opened"
  | "share_card_previewed"
  | "share_card_downloaded"
  | "dm_opened"
  | "dm_sent"
  | "notifications_opened"
  | "post_page_opened"
  | "share_dialog_opened"
  | "vote_attempted"
  | "vote_success"
  | "vote_failed"
  | "verification_page_opened"
  // ShareDialog funnel — measure friction in the sharing flow
  | "share_status_cache_hit"
  | "share_status_cache_miss"
  | "share_status_refresh_started"
  | "share_status_refresh_success"
  | "share_status_refresh_error"
  | "share_attempted"
  | "share_success"
  | "share_blocked_hidden"
  | "share_blocked_deleted"
  | "share_blocked_unavailable"
  | "share_channel_selected"
  // Discover page interactions
  | "discover_opened"
  | "discover_section_viewed"
  | "discover_scroll_depth_reached"
  | "discover_window_changed"
  | "discover_refreshed"
  | "discover_trending_post_impression"
  | "discover_trending_post_opened"
  | "discover_trending_post_clicked"
  | "discover_battle_preview_opened"
  | "discover_battle_preview_clicked"
  | "discover_creator_followed"
  | "discover_creator_unfollowed"
  | "discover_nearby_creator_opened"
  | "discover_people_near_you_radius_changed"
  | "discover_people_near_you_geo_fallback_used"
  | "discover_people_near_you_profile_clicked"
  | "discover_trending_pagination_loaded"
  | "discover_battles_pagination_loaded"
  | "discover_search_submitted"
  | "discover_cache_hit"
  | "discover_cache_miss"
  | "discover_pagination_failed"
  | "discover_duplicate_prevented"
  | "discover_state_restored"
  // Crown Battles engagement + voting integrity
  | "battle_list_viewed"
  | "battle_opened"
  | "battle_vote_started"
  | "battle_vote_success"
  | "battle_vote_failed"
  | "battle_vote_blocked_duplicate"
  | "battle_status_changed"
  | "battle_pagination_loaded"
  | "battle_pagination_retry"
  | "battle_pagination_failed"
  | "battle_no_more_results"
  | "battle_detail_view"
  // Gift purchase + send funnel
  | "gift_flow_opened"
  | "gift_recipient_selected"
  | "gift_send_started"
  | "gift_sent"
  | "gift_send_failed"
  | "gift_insufficient_balance"
  | "shekels_purchase_started";


async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function dailySalt(): string {
  // YYYY-MM-DD UTC — rotates the hash each day so events become unlinkable
  return new Date().toISOString().slice(0, 10);
}

let cachedHash: { uid: string | null; day: string; hash: string | null } | null = null;

async function getUserHash(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id ?? null;
  const day = dailySalt();
  if (cachedHash && cachedHash.uid === uid && cachedHash.day === day) return cachedHash.hash;
  const hash = uid ? await sha256Hex(`${uid}|${day}|crownme-analytics-v1`) : null;
  cachedHash = { uid, day, hash };
  return hash;
}

export interface TrackPayload {
  postId?: string | null;
  category?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

export async function trackEvent(event: EventName, payload: TrackPayload = {}): Promise<void> {
  try {
    const user_hash = await getUserHash();
    if (!user_hash) return; // anonymous visitors are not tracked
    // Strip any potentially identifying values from metadata
    const safeMeta: Record<string, string | number | boolean | null> = {};
    if (payload.metadata) {
      for (const [k, v] of Object.entries(payload.metadata)) {
        if (typeof v === "string" && v.length > 64) continue;
        safeMeta[k] = v;
      }
    }
    await supabase.from("analytics_events").insert({
      event_name: event,
      user_hash,
      post_id: payload.postId ?? null,
      category: payload.category ?? null,
      metadata: safeMeta,
    });
  } catch {
    // Analytics must never break the UX
  }
}
