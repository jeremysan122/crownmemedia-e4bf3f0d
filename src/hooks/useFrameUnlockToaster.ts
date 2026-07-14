import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { trackEvent } from "@/lib/analytics";

/**
 * Subscribes to the current user's `notifications` inserts and shows a
 * celebratory toast when a `frame_unlocked` payload lands. Rendered once
 * from the app shell — safe to no-op when logged out.
 */
export function useFrameUnlockToaster() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`frame-unlock-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const p = (payload.new as { payload?: Record<string, unknown>; title?: string; body?: string }) ?? {};
          const meta = (p.payload ?? {}) as Record<string, unknown>;
          if (meta.kind === "frame_unlocked") {
            void trackEvent("achievement_frame_unlocked", {
              metadata: {
                slug: typeof meta.slug === "string" ? meta.slug : null,
                rarity: typeof meta.rarity === "string" ? meta.rarity : null,
                frame_id: typeof meta.frame_id === "string" ? meta.frame_id : null,
              },
            });
            toast.success(p.title ?? "New royal frame unlocked", {
              description: p.body,
              duration: 6500,
              action: {
                label: "View",
                onClick: () => { window.location.href = "/frames"; },
              },
            });
          }
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user?.id]);
}
