import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users as UsersIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props { ids: string[] }

/** Resolves a list of user ids to @username chips. Cached per id in-session. */
const usernameCache = new Map<string, string>();

export default function TaggedPeopleLine({ ids }: Props) {
  const [map, setMap] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>();
    ids.forEach((id) => { const u = usernameCache.get(id); if (u) m.set(id, u); });
    return m;
  });

  useEffect(() => {
    const missing = ids.filter((id) => !usernameCache.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", missing);
      if (cancelled) return;
      (data ?? []).forEach((p) => usernameCache.set(p.id, p.username));
      const next = new Map<string, string>();
      ids.forEach((id) => { const u = usernameCache.get(id); if (u) next.set(id, u); });
      setMap(next);
    })();
    return () => { cancelled = true; };
  }, [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (ids.length === 0) return null;
  const shown = ids.slice(0, 5);
  return (
    <p className="px-3 pt-1.5 text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
      <UsersIcon size={10} />
      <span>with</span>
      {shown.map((id) => {
        const u = map.get(id);
        return u ? (
          <Link key={id} to={`/u/${u}`} className="text-primary hover:underline">@{u}</Link>
        ) : (
          <span key={id} className="opacity-60">@…</span>
        );
      })}
      {ids.length > 5 && <span>+{ids.length - 5} more</span>}
    </p>
  );
}
