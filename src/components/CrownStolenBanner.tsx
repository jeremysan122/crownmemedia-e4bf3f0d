import { useEffect, useState } from "react";
import { Crown, Swords, Sparkles, X, ArrowUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Link } from "react-router-dom";
import { fxGiftSend } from "@/lib/giftFx";

interface StealEvent {
  id: string;
  battleId: string;
  postId: string | null;
  body: string;
  battleWinBonus: number;
  crownStealBonus: number;
  totalBonus: number;
  previousScore: number | null;
  scoreAfterWin: number | null;
  finalScore: number | null;
  leaderScore: number | null;
  crownStolen: boolean;
}

/**
 * Listens for new battle-win notifications and surfaces a celebratory banner
 * with the exact stolen bonus formula, highlighting the score fields that
 * increased (previous → after-win → final). Self-dismisses after 9s.
 */
export default function CrownStolenBanner() {
  const { user } = useAuth();
  const [event, setEvent] = useState<StealEvent | null>(null);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`crown-steal-${user.id}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row: any = payload.new;
          if (!row) return;
          const title = (row.title as string | undefined) ?? "";
          const p = row.payload as Record<string, any> | null;
          if (!p?.battle_id) return;
          if (!title.toLowerCase().includes("crown") && !title.toLowerCase().includes("battle")) return;
          const total = Number(p.bonus ?? 0);
          if (!total) return;
          const stolen = Boolean(p.crown_stolen);
          setEvent({
            id: row.id,
            battleId: p.battle_id,
            postId: p.post_id ?? null,
            body: row.body ?? "Your post earned a battle win bonus.",
            battleWinBonus: Number(p.battle_win_bonus ?? 5),
            crownStealBonus: Number(p.crown_steal_bonus ?? 0),
            totalBonus: total,
            previousScore: p.previous_score != null ? Number(p.previous_score) : null,
            scoreAfterWin: p.score_after_win != null ? Number(p.score_after_win) : null,
            finalScore: p.final_score != null ? Number(p.final_score) : null,
            leaderScore: p.leader_score != null ? Number(p.leader_score) : null,
            crownStolen: stolen,
          });
          fxGiftSend(stolen ? "mythic" : "legendary");
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  useEffect(() => {
    if (!event) return;
    const t = setTimeout(() => setEvent(null), 9000);
    return () => clearTimeout(t);
  }, [event]);

  if (!event) return null;

  const fmt = (n: number | null) => (n == null ? "—" : Number(n).toFixed(2));

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[min(94vw,500px)] animate-scale-in"
      role="status"
      aria-live="polite"
    >
      <div className="royal-card border-2 border-primary/60 gold-shadow overflow-hidden">
        {/* Animated header */}
        <div className="relative bg-gradient-gold px-4 py-3 flex items-center gap-3 overflow-hidden">
          <div className="absolute inset-0 opacity-30">
            <Sparkles size={120} className="absolute -top-6 -right-4 text-white/40 animate-crown-pulse" />
          </div>
          <Crown size={28} className="text-primary-foreground animate-crown-pulse shrink-0" fill="currentColor" />
          <div className="flex-1 min-w-0">
            <div className="font-display text-lg text-primary-foreground tracking-wide leading-tight">
              {event.crownStolen ? "CROWN STOLEN" : "BATTLE WON"}
            </div>
            <div className="text-[11px] text-primary-foreground/80 font-semibold uppercase tracking-widest">
              {event.crownStolen ? "You dethroned the regional leader" : "+ battle win bonus applied"}
            </div>
          </div>
          <button
            onClick={() => setEvent(null)}
            className="text-primary-foreground/70 hover:text-primary-foreground p-1"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-3 space-y-2">
          <p className="text-sm">{event.body}</p>

          {/* Bonus formula */}
          <div className="rounded-lg bg-muted/40 px-3 py-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <Swords size={14} className="text-primary" />
                <span className="text-muted-foreground">Battle win bonus</span>
              </div>
              <span className="font-display text-base text-gold tabular-nums">
                +{event.battleWinBonus.toFixed(2)}
              </span>
            </div>
            {event.crownStolen && (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <Crown size={14} className="text-primary" fill="currentColor" />
                  <span className="text-muted-foreground">Crown-steal bonus</span>
                </div>
                <span className="font-display text-base text-gold tabular-nums">
                  +{event.crownStealBonus.toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
              <span className="text-[11px] uppercase tracking-widest font-bold">Total</span>
              <span className="font-display text-lg text-gold tabular-nums">
                +{event.totalBonus.toFixed(2)}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground tabular-nums font-mono pt-0.5">
              {event.battleWinBonus.toFixed(2)}
              {event.crownStolen ? ` + ${event.crownStealBonus.toFixed(2)}` : ""} ={" "}
              <span className="text-gold font-bold">{event.totalBonus.toFixed(2)}</span>
            </p>
          </div>

          {/* Highlighted score progression — shows which fields increased */}
          {(event.previousScore != null || event.finalScore != null) && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1.5">
                Crown Score progression
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Before</p>
                  <p className="text-sm font-bold tabular-nums">{fmt(event.previousScore)}</p>
                </div>
                <div className="rounded-md bg-gold/10 ring-1 ring-gold/40 -mx-1 px-1 py-0.5">
                  <p className="text-[9px] uppercase tracking-wider text-gold font-bold flex items-center justify-center gap-0.5">
                    <ArrowUp size={9} /> After win
                  </p>
                  <p className="text-sm font-bold tabular-nums text-gold">{fmt(event.scoreAfterWin)}</p>
                </div>
                <div className={event.crownStolen ? "rounded-md bg-gold/20 ring-2 ring-gold -mx-1 px-1 py-0.5 animate-crown-pulse" : ""}>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Final</p>
                  <p className={`text-sm font-bold tabular-nums ${event.crownStolen ? "text-gold" : ""}`}>
                    {fmt(event.finalScore)}
                  </p>
                </div>
              </div>
              {event.leaderScore != null && (
                <p className="text-[10px] text-muted-foreground mt-1.5 text-center tabular-nums">
                  {event.crownStolen ? "Surpassed" : "Leader at"}{" "}
                  <span className="font-semibold">{fmt(event.leaderScore)}</span>
                  {event.crownStolen && event.finalScore != null && (
                    <> by <span className="text-gold font-bold">+{(event.finalScore - event.leaderScore).toFixed(2)}</span></>
                  )}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Link
              to="/battles"
              className="flex-1 text-center text-xs font-bold tracking-wide bg-gradient-gold text-primary-foreground rounded-lg py-2"
              onClick={() => setEvent(null)}
            >
              View battle
            </Link>
            <Link
              to="/leaderboard"
              className="flex-1 text-center text-xs font-bold tracking-wide bg-muted text-foreground rounded-lg py-2"
              onClick={() => setEvent(null)}
            >
              See leaderboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
