import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

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
          const p = (payload.new as { payload?: Record<string, unknown>; title?: string; body?: string }) ?? {};
          const kind = (p?.payload as { kind?: string } | undefined)?.kind;
          if (!kind) return;
          if (kind === "frame_unlocked") return; // handled elsewhere
          if (kind === "achievement_unlocked" || kind === "badge_unlocked" || kind === "title_unlocked") {
            toast.success(p.title ?? "Achievement unlocked", {
              description: p.body,
              duration: 6500,
              action: {
                label: "View",
                onClick: () => { window.location.href = "/achievements"; },
              },
            });
          }
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user?.id]);
}
