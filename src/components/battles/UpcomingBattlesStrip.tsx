// Upcoming (scheduled) battles strip. Reads live_battles where status='scheduled'
// and scheduled_start_at is in the future. Respects category/region filters.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CalendarClock } from "lucide-react";
import { useBattleFilters } from "@/components/battles/BattleFilterBar";
import FollowBattlerButton from "@/components/battles/FollowBattlerButton";
import { humanizeSlug } from "@/lib/textLabels";

interface Row {
  id: string;
  host_id: string;
  opponent_id: string;
  category_slug: string | null;
  region: string | null;
  scheduled_start_at: string | null;
}
interface Profile { id: string; username: string; profile_photo_url: string | null }

export default function UpcomingBattlesStrip() {
  const { filters } = useBattleFilters();
  const [rows, setRows] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        let q = supabase
          .from("live_battles")
          .select("id,host_id,opponent_id,category_slug,region,scheduled_start_at")
          .eq("status", "scheduled")
          .gte("scheduled_start_at", new Date().toISOString())
          .order("scheduled_start_at", { ascending: true })
          .limit(10);
        if (filters.category) q = q.eq("category_slug", filters.category);
        if (filters.region) q = q.eq("region", filters.region);
        const { data } = await q;
        if (!alive) return;
        const list = (data ?? []) as Row[];
        setRows(list);
        const ids = Array.from(new Set(list.flatMap((r) => [r.host_id, r.opponent_id]).filter(Boolean)));
        if (ids.length) {
          const { data: prof } = await supabase.from("profiles")
            .select("id,username,profile_photo_url").in("id", ids);
          const map: Record<string, Profile> = {};
          (prof ?? []).forEach((p: any) => { map[p.id] = p as Profile; });
          if (alive) setProfiles(map);
        }
        if (alive) setLoaded(true);
      } catch {
        if (alive) setLoaded(true);
      }
    };
    load();
    return () => { alive = false; };
  }, [filters.category, filters.region]);

  if (!loaded || rows.length === 0) return null;

  return (
    <section className="mb-6" aria-label="Upcoming scheduled battles">
      <div className="mb-2 flex items-center gap-2">
        <CalendarClock size={14} className="text-primary" />
        <h2 className="text-xs font-black uppercase tracking-wider">Upcoming</h2>
        <span className="text-xs text-muted-foreground">{rows.length}</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory">
        {rows.map((r) => {
          const host = profiles[r.host_id]; const opp = profiles[r.opponent_id];
          const when = r.scheduled_start_at ? new Date(r.scheduled_start_at) : null;
          return (
            <div key={r.id} className="snap-start shrink-0 w-56 rounded-2xl border border-border/60 bg-card p-3">
              <Link to={`/live/${r.id}`} className="block hover:opacity-90 transition">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Scheduled</span>
                  {r.category_slug && (
                    <span className="ml-auto text-[10px] text-muted-foreground uppercase">{humanizeSlug(r.category_slug)}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Avatar p={host} /> <span className="text-xs text-muted-foreground">vs</span> <Avatar p={opp} />
                </div>
                <div className="mt-2 text-xs text-muted-foreground truncate">
                  @{host?.username ?? "royal"} vs @{opp?.username ?? "royal"}
                </div>
                {when && (
                  <div className="mt-1 text-[11px] text-primary font-semibold">
                    {when.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </div>
                )}
              </Link>
              <div className="mt-2 flex gap-1">
                <FollowBattlerButton battlerId={r.host_id} compact size="sm" />
                <FollowBattlerButton battlerId={r.opponent_id} compact size="sm" />
              </div>
            </div>
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
