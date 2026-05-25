import { useEffect, useState, useCallback } from "react";
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
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("notification_preferences")
        .select("reply_alerts, mention_alerts, dm_alerts, battle_invite_alerts, battle_winner_alerts, push_enabled, sound_enabled")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!alive) return;
      if (data) setPrefs({ ...DEFAULTS, ...(data as Partial<NotificationPrefs>) });
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user]);

  const update = useCallback(async (patch: Partial<NotificationPrefs>) => {
    if (!user) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    await supabase
      .from("notification_preferences")
      .upsert({ user_id: user.id, ...next, updated_at: new Date().toISOString() });
  }, [user, prefs]);

  return { prefs, update, loading };
}
