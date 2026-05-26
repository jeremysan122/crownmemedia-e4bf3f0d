import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

type NotifRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  payload: { link?: string; broadcast?: boolean } | null;
  read: boolean;
  created_at: string;
};

/**
 * Global realtime notification listener. Mounted once at the app root.
 * Renders a Sonner toast for every new notification row inserted for the
 * current user, with a click-through to the deep link in `payload.link`.
 *
 * De-dupes via a Set so React StrictMode double-invocations and any
 * accidental rebroadcasts never produce a double toast.
 */
export default function NotificationToaster() {
  const { user } = useAuth();
  const nav = useNavigate();
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`global-notif-${user.id}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as NotifRow;
          if (seen.current.has(n.id)) return;
          seen.current.add(n.id);
          if (seen.current.size > 200) {
            // bound memory: drop oldest half once we cross 200
            seen.current = new Set(Array.from(seen.current).slice(-100));
          }

          const link = n.payload?.link;
          toast(n.title, {
            description: n.body ?? undefined,
            duration: 6000,
            action: link
              ? { label: "Open", onClick: () => nav(link) }
              : undefined,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, nav]);

  return null;
}
