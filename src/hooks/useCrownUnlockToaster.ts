import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { trackEvent } from "@/lib/analytics";

/**
 * Subscribes to the current user's `notifications` inserts and shows a
 * celebratory toast when a `crown_unlocked` payload lands. Rare / legendary /
 * mythic unlocks are given a longer duration and a special label. Mounted once
 * from the app shell — safe to no-op when logged out.
 */
export function useCrownUnlockToaster() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`crown-unlock-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const p = (payload.new as { payload?: Record<string, unknown>; title?: string; body?: string }) ?? {};
          const meta = (p.payload ?? {}) as Record<string, unknown>;
          if (meta.kind !== "crown_unlocked") return;

          const slug = typeof meta.slug === "string" ? meta.slug : null;
          const rarity = typeof meta.rarity === "string" ? meta.rarity : "common";
          const name = typeof meta.name === "string" ? meta.name : null;
          const isRare = ["rare", "epic", "legendary", "mythic"].includes(rarity);

          void trackEvent("achievement_crown_unlocked", {
            metadata: {
              slug,
              rarity,
              crown_id: typeof meta.crown_id === "string" ? meta.crown_id : null,
            },
          });

          toast.success(isRare ? `✨ ${rarity.toUpperCase()} CROWN UNLOCKED` : (p.title ?? "New crown unlocked"), {
            description: name ? `${name}` : p.body,
            duration: isRare ? 9000 : 6500,
            action: {
              label: "View",
              onClick: () => {
                window.location.href = slug ? `/achievement-crowns?slug=${slug}` : "/achievement-crowns";
              },
            },
          });
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user?.id]);
}
