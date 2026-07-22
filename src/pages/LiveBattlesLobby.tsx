// Live Battles lobby — Live / Pending / Ended tabs with category filter.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { supabase } from "@/integrations/supabase/client";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { Radio, ArrowLeft, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CreateLiveBattleDialog from "@/components/battles/CreateLiveBattleDialog";
import LiveBattleEmptyState from "@/components/battles/LiveBattleEmptyState";
import { useMainCategories } from "@/lib/categories";
import { humanizeSlug } from "@/lib/textLabels";

interface Row {
  id: string; status: string; host_id: string; opponent_id: string;
  host_votes: number; opponent_votes: number; created_at: string;
  category_slug: string | null; region: string | null;
}
interface Profile { id: string; username: string; profile_photo_url: string | null }

type StatusKey = "live" | "pending" | "ended";

export default function LiveBattlesLobby() {
  useSeoMeta({
    title: "Live Battles — CrownMe",
    description: "Join live head-to-head battles happening now.",
  });
  const nav = useNavigate();
  const { mains } = useMainCategories();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [tab, setTab] = useState<StatusKey>("live");
  const [category, setCategory] = useState<string>("all");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    isFeatureEnabled("live_battles_enabled").then(setEnabled).catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    (async () => {
      setRows(null);
      let q = supabase.from("live_battles")
        .select("id,status,host_id,opponent_id,host_votes,opponent_votes,created_at,category_slug,region")
        .eq("status", tab)
        .order("created_at", { ascending: false })
        .limit(50);
      if (category !== "all") q = q.eq("category_slug", category);
      const { data } = await q;
      if (!mounted) return;
      const list = (data ?? []) as Row[];
      setRows(list);
      const ids = Array.from(new Set(list.flatMap((r) => [r.host_id, r.opponent_id])));
      if (ids.length) {
        const { data: prof } = await supabase.from("profiles").select("id,username,profile_photo_url").in("id", ids);
        const map: Record<string, Profile> = {};
        (prof ?? []).forEach((p: any) => { map[p.id] = p as Profile; });
        if (mounted) setProfiles(map);
      }
    })();
    return () => { mounted = false; };
  }, [enabled, tab, category]);

  const emptyMsg = useMemo(() => ({
    live: "No live battles right now. Start one to get the crowd fired up.",
    pending: "No pending invites right now.",
    ended: "No recent ended battles yet.",
  }[tab]), [tab]);

  return (
    <AppShell>
      <div className="mx-auto max-w-lg px-4 pt-4 pb-24">
        <button onClick={() => nav("/battles")}
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-2xl font-black tracking-tight flex items-center gap-2 mb-1">
          <Radio className="text-destructive" size={22} /> Live Battles
        </h1>
        <p className="text-sm text-muted-foreground mb-4">Real-time 1v1 head-to-head with audience voting.</p>

        {enabled && (
          <Button
            onClick={() => setCreateOpen(true)}
            className="w-full mb-4"
            size="lg"
            data-testid="go-live-cta-lobby"
          >
            <Plus size={18} className="mr-1" /> Go Live Battle
          </Button>
        )}

        {enabled === false && <div className="mb-4"><LiveBattleEmptyState /></div>}

        {enabled && (
          <>
            <div className="mb-3 flex items-center gap-2">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full max-w-[180px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {mains.map((m) => (
                    <SelectItem key={m.slug} value={m.slug}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as StatusKey)}>
              <TabsList className="grid grid-cols-3 w-full mb-3">
                <TabsTrigger value="live">Live</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="ended">Ended</TabsTrigger>
              </TabsList>
              <TabsContent value={tab}>
                {rows === null ? (
                  <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="animate-spin" /></div>
                ) : rows.length === 0 ? (
                  <EmptyState msg={emptyMsg} />
                ) : (
                  <ul className="space-y-3">
                    {rows.map((r) => (
                      <BattleRow key={r.id} row={r} profiles={profiles} />
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
      <CreateLiveBattleDialog open={createOpen} onOpenChange={setCreateOpen} />
    </AppShell>
  );
}

function BattleRow({ row, profiles }: { row: Row; profiles: Record<string, Profile> }) {
  const total = row.host_votes + row.opponent_votes;
  const host = profiles[row.host_id]; const opp = profiles[row.opponent_id];
  const dot = row.status === "live" ? "bg-red-500 animate-pulse"
    : row.status === "pending" ? "bg-yellow-500" : "bg-muted-foreground";
  return (
    <li>
      <Link to={`/live/${row.id}`}
        className="block rounded-2xl border border-border/60 bg-card p-4 hover:border-primary/50 transition">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
            <span className="text-xs font-bold uppercase tracking-wider">{row.status}</span>
            {row.category_slug && (
              <span className="text-[10px] text-muted-foreground uppercase">· {humanizeSlug(row.category_slug)}</span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{total} votes</span>
        </div>
        <div className="flex items-center gap-3">
          <PP p={host} /> <span className="text-xs text-muted-foreground">vs</span> <PP p={opp} />
          <div className="flex-1 min-w-0 text-xs truncate text-muted-foreground ml-1">
            @{host?.username ?? "royal"} vs @{opp?.username ?? "royal"}
          </div>
        </div>
      </Link>
    </li>
  );
}

function PP({ p }: { p?: Profile }) {
  return p?.profile_photo_url
    ? <img src={p.profile_photo_url} alt="" className="w-9 h-9 rounded-full object-cover" />
    : <div className="w-9 h-9 rounded-full bg-muted" />;
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center">
      <p className="text-sm text-muted-foreground">{msg}</p>
      <Button asChild variant="outline" size="sm" className="mt-4">
        <Link to="/battles/posts">Try Post Battles</Link>
      </Button>
    </div>
  );
}
