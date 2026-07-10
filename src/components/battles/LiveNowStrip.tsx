// Horizontal strip of currently-live battles for the Battles Hub.
// Silent-fails and hides itself when the feature is off or nothing is live.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Radio } from "lucide-react";

interface Row {
  id: string;
  host_id: string;
  opponent_id: string;
  host_votes: number;
  opponent_votes: number;
  category_slug: string | null;
  region: string | null;
  started_at: string | null;
}
interface Profile { id: string; username: string; profile_photo_url: string | null }

export default function LiveNowStrip() {
  const [rows, setRows] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase
        .from("live_battles")
        .select("id,host_id,opponent_id,host_votes,opponent_votes,category_slug,region,started_at")
        .eq("status", "live")
        .order("started_at", { ascending: false })
        .limit(10);
      if (!mounted) return;
      const list = (data ?? []) as Row[];
      setRows(list);
      const ids = Array.from(new Set(list.flatMap((r) => [r.host_id, r.opponent_id])));
      if (ids.length) {
        const { data: prof } = await supabase
          .from("profiles").select("id,username,profile_photo_url").in("id", ids);
        const map: Record<string, Profile> = {};
        (prof ?? []).forEach((p: any) => { map[p.id] = p as Profile; });
        if (mounted) setProfiles(map);
      }
      if (mounted) setLoaded(true);
    };
    load();
    const ch = supabase
      .channel("live_now_strip")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_battles" }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);

  if (!loaded || rows.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-2">
        <Radio size={14} className="text-red-500 animate-pulse" />
        <h2 className="text-xs font-bold uppercase tracking-wider">Live now</h2>
        <span className="text-xs text-muted-foreground">{rows.length}</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory">
        {rows.map((r) => {
          const host = profiles[r.host_id]; const opp = profiles[r.opponent_id];
          return (
            <Link
              key={r.id}
              to={`/live/${r.id}`}
              className="snap-start shrink-0 w-52 rounded-2xl border border-border/60 bg-card p-3 hover:border-destructive/50 transition"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-500">Live</span>
                {r.category_slug && (
                  <span className="ml-auto text-[10px] text-muted-foreground uppercase">{r.category_slug}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Avatar p={host} /> <span className="text-xs text-muted-foreground">vs</span> <Avatar p={opp} />
              </div>
              <div className="mt-2 text-xs text-muted-foreground truncate">
                @{host?.username ?? "royal"} vs @{opp?.username ?? "royal"}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {r.host_votes + r.opponent_votes} votes
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Avatar({ p }: { p?: Profile }) {
  if (p?.profile_photo_url) {
    return <img src={p.profile_photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />;
  }
  return <div className="w-8 h-8 rounded-full bg-muted" />;
}
