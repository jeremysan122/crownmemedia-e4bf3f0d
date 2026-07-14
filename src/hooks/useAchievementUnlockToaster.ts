import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { trackEvent } from "@/lib/analytics";

/**
 * Emits a toast for any achievement unlock notification (badge, title, shekel,
 * boost). Frame unlocks continue to be handled by `useFrameUnlockToaster` to
 * preserve the "View my frames" deep-link.
 */
export function useAchievementUnlockToaster() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`achievement-unlock-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = (payload.new as { payload?: Record<string, unknown>; title?: string; body?: string }) ?? {};
          const meta = (row.payload ?? {}) as Record<string, unknown>;
          const kind = typeof meta.kind === "string" ? meta.kind : undefined;
          if (!kind) return;
          if (kind === "frame_unlocked") return; // handled elsewhere

          const safeMeta = {
            kind,
            slug: typeof meta.slug === "string" ? meta.slug : null,
            rarity: typeof meta.rarity === "string" ? meta.rarity : null,
            checkpoint: typeof meta.checkpoint === "number" ? meta.checkpoint : null,
            reward_type: typeof meta.reward_type === "string" ? meta.reward_type : null,
          };

          if (kind === "achievement_unlocked") void trackEvent("achievement_unlocked", { metadata: safeMeta });
          else if (kind === "badge_unlocked") void trackEvent("achievement_badge_unlocked", { metadata: safeMeta });
          else if (kind === "title_unlocked") void trackEvent("achievement_title_unlocked", { metadata: safeMeta });
          else if (kind === "shekel_grant") void trackEvent("achievement_shekel_grant", { metadata: safeMeta });
          else if (kind === "boost_grant") void trackEvent("achievement_boost_grant", { metadata: safeMeta });
          else if (kind === "checkpoint_reached") {
            void trackEvent("achievement_checkpoint_reached", { metadata: safeMeta });
            return; // no toast — page-level tracker handles UI
          } else return;

          toast.success(row.title ?? "Achievement unlocked", {
            description: row.body,
            duration: 6500,
            action: {
              label: "View",
              onClick: () => { window.location.href = "/achievements"; },
            },
          });
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user?.id]);
}
