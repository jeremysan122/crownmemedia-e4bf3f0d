import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export interface NotificationPrefs {
  reply_alerts: boolean;
  mention_alerts: boolean;
  dm_alerts: boolean;
  battle_invite_alerts: boolean;
  battle_winner_alerts: boolean;
  push_enabled: boolean;
  sound_enabled: boolean;
}

const DEFAULTS: NotificationPrefs = {
  reply_alerts: true,
  mention_alerts: true,
  dm_alerts: true,
  battle_invite_alerts: true,
  battle_winner_alerts: true,
  push_enabled: false,
  sound_enabled: true,
};

export function useNotificationPrefs() {
  const { user } = useAuth();
  const userId = user?.id;
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  // Keep a ref to prefs so update() can read the latest without being in its dep array.
  const prefsRef = useRef(prefs);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("notification_preferences")
        .select("reply_alerts, mention_alerts, dm_alerts, battle_invite_alerts, battle_winner_alerts, push_enabled, sound_enabled")
        .eq("user_id", userId)
        .maybeSingle();
      if (!alive) return;
      if (data) setPrefs({ ...DEFAULTS, ...(data as Partial<NotificationPrefs>) });
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [userId]); // stable primitive — avoids re-fetch on every auth context re-render

  const update = useCallback(async (patch: Partial<NotificationPrefs>) => {
    if (!userId) return;
    // Compute next from ref so this callback doesn't need `prefs` in its dep array,
    // which would create a new function reference on every preference save.
    const next = { ...prefsRef.current, ...patch };
    setPrefs(next);
    await supabase
      .from("notification_preferences")
      .upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() });
  }, [userId]); // stable — never changes until user signs in/out

  return { prefs, update, loading };
}
