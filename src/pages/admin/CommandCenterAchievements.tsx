import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw, Play, Trophy, Activity } from "lucide-react";
import { useSeoMeta } from "@/hooks/useSeoMeta";

interface Stats {
  events_pending: number;
  events_failed: number;
  events_processed: number;
  users_with_progress: number;
  total_unlocks: number;
  total_rewards: number;
  active_definitions: number;
  weekly_quests_active: number;
  weekly_quests_completed_this_week: number;
  last_processed_at: string | null;
}

function Stat({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "warn" | "good" }) {
  const color = tone === "warn" ? "text-orange-400" : tone === "good" ? "text-gold" : "text-foreground";
  return (
    <div className="royal-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-display tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

export default function CommandCenterAchievements() {
  useSeoMeta({ title: "Achievements Telemetry · Admin", description: "Achievement pipeline health, unlocks, and weekly quests." });
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_achievement_stats");
    if (error) toast.error(error.message);
    else setStats(data as unknown as Stats);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function runPipeline() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("achievements-process-batch", {
        body: { batch_size: 500, time_limit: 800 },
      });
      if (error) throw error;
      toast.success("Pipeline ran", { description: JSON.stringify(data?.result ?? {}).slice(0, 140) });
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "Pipeline run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl flex items-center gap-2"><Trophy className="text-gold" size={22}/> Achievements</h1>
          <p className="text-sm text-muted-foreground">Pipeline, unlocks, and weekly quest telemetry.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={refresh} disabled={loading}
            className="text-xs font-bold px-3 py-2 rounded border border-border hover:bg-muted/30 inline-flex items-center gap-1">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""}/> Refresh
          </button>
          <button onClick={runPipeline} disabled={running}
            className="text-xs font-bold px-3 py-2 rounded bg-gradient-gold text-black inline-flex items-center gap-1 disabled:opacity-50">
            <Play size={12}/> {running ? "Running…" : "Run pipeline"}
          </button>
        </div>
      </header>

      {!stats ? (
        <div className="royal-card p-8 text-center text-sm text-muted-foreground">Loading telemetry…</div>
      ) : (
        <>
          <section className="mb-6">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-gold/80 mb-2 flex items-center gap-1"><Activity size={12}/> Event Pipeline</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Pending" value={stats.events_pending} tone={stats.events_pending > 100 ? "warn" : "default"} />
              <Stat label="Failed" value={stats.events_failed} tone={stats.events_failed > 0 ? "warn" : "good"} />
              <Stat label="Processed" value={stats.events_processed} />
              <Stat label="Last processed" value={stats.last_processed_at ? new Date(stats.last_processed_at).toLocaleString() : "—"} />
            </div>
          </section>

          <section className="mb-6">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-gold/80 mb-2">Progress & Unlocks</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Users with progress" value={stats.users_with_progress} />
              <Stat label="Frame unlocks" value={stats.total_unlocks} tone="good" />
              <Stat label="Total rewards granted" value={stats.total_rewards} />
              <Stat label="Active definitions" value={stats.active_definitions} />
            </div>
          </section>

          <section>
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-gold/80 mb-2">Weekly Quests</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Active quests" value={stats.weekly_quests_active} />
              <Stat label="Completed this week" value={stats.weekly_quests_completed_this_week} tone="good" />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
