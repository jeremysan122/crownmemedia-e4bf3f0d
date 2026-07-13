import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

/**
 * User preference toggle for hiding their equipped avatar frame across the app.
 * Backed by profiles.frames_hidden + set_frames_hidden(bool) RPC.
 */
export function useFramesHidden() {
  const { user } = useAuth();
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setHidden(false); setLoading(false); return; }
    setLoading(true);
    const { data } = await (supabase as any)
      .from("profiles")
      .select("frames_hidden")
      .eq("id", user.id)
      .maybeSingle();
    setHidden(!!data?.frames_hidden);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const setValue = useCallback(async (next: boolean) => {
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("set_frames_hidden", { _hidden: next });
      if (error) throw error;
      setHidden(next);
    } finally { setSaving(false); }
  }, []);

  return { hidden, setHidden: setValue, loading, saving };
}
