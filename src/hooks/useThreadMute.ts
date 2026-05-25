import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

/** Manage whether the current user has muted reply/mention alerts for a post. */
export function useThreadMute(postId: string | null | undefined) {
  const { user } = useAuth();
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !postId) { setMuted(false); setLoading(false); return; }
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("muted_threads")
        .select("id")
        .eq("user_id", user.id)
        .eq("post_id", postId)
        .maybeSingle();
      if (!alive) return;
      setMuted(!!data);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user, postId]);

  const toggle = useCallback(async () => {
    if (!user || !postId) return;
    if (muted) {
      setMuted(false);
      await supabase.from("muted_threads").delete().eq("user_id", user.id).eq("post_id", postId);
    } else {
      setMuted(true);
      await supabase.from("muted_threads").insert({ user_id: user.id, post_id: postId });
    }
  }, [user, postId, muted]);

  return { muted, toggle, loading };
}
