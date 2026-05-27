import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import CrownLoader from "@/components/CrownLoader";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Trophy, Gift } from "lucide-react";

type PrizeType = "shekels" | "battle_tickets" | "royal_pass_days" | "profile_boost_hours" | "bonus_spin" | "nothing";

const PRIZE_ICON: Record<PrizeType, string> = {
  shekels: "💰",
  battle_tickets: "⚔️",
  royal_pass_days: "👑",
  profile_boost_hours: "🚀",
  bonus_spin: "✨",
  nothing: "💤",
};

function effectLine(t: PrizeType, v: number): string {
  switch (t) {
    case "battle_tickets":      return `+${v} Battle Ticket${v === 1 ? "" : "s"} credited`;
    case "royal_pass_days":     return `Royal Pass extended ${v} day${v === 1 ? "" : "s"}`;
    case "profile_boost_hours": return `Profile Boost active for ${v}h`;
    case "bonus_spin":          return "Bonus spin granted";
    case "shekels":             return `+${v} Shekels credited`;
    case "nothing":             return "No prize";
  }
}

type Spin = {
  id: string;
  created_at: string;
  prize_type: PrizeType;
  prize_value: number;
  source: string;
  prize_id: string | null;
};

type Claim = {
  id: string;
  claim_date: string;
  shekels_awarded: number;
  day_in_streak: number;
};

export default function RewardHistory() {
  const { user, loading: authLoading } = useAuth();
  useSeoMeta({ title: "Reward History — CrownMe", description: "Every spin, claim, and perk you've earned." });

  const [loading, setLoading] = useState(true);
  const [spins, setSpins] = useState<Spin[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [s, c, p] = await Promise.all([
        supabase.from("spin_wheel_spins").select("id,created_at,prize_type,prize_value,source,prize_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
        supabase.from("daily_reward_claims").select("id,claim_date,shekels_awarded,day_in_streak").eq("user_id", user.id).order("claim_date", { ascending: false }).limit(30),
        supabase.from("spin_wheel_prizes").select("id,label"),
      ]);
      if (cancelled) return;
      setSpins((s.data as Spin[]) ?? []);
      setClaims((c.data as Claim[]) ?? []);
      const m: Record<string, string> = {};
      for (const row of (p.data as { id: string; label: string }[] | null) ?? []) m[row.id] = row.label;
      setLabels(m);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  if (authLoading || loading) return <CrownLoader label="Loading history…" />;

  const fmtDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

  return (
    <main className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-10 backdrop-blur bg-background/70 border-b border-border/40">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/rewards" aria-label="Back" className="p-2 -ml-2 rounded-full hover:bg-muted"><ArrowLeft className="size-5" /></Link>
          <h1 className="font-display text-lg tracking-widest">REWARD HISTORY</h1>
          <span className="w-9" />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="size-5 text-primary" />
            <h2 className="font-display text-lg tracking-wide">Spin outcomes</h2>
            <span className="ml-auto text-xs text-muted-foreground">{spins.length}</span>
          </div>
          {spins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No spins yet — claim your daily reward and spin the wheel.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {spins.map((s) => (
                <li key={s.id} className="py-3 flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-muted/60 flex items-center justify-center text-lg shrink-0">
                    {PRIZE_ICON[s.prize_type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {labels[s.prize_id ?? ""] ?? effectLine(s.prize_type, s.prize_value)}
                    </p>
                    <p className="text-xs text-muted-foreground">{effectLine(s.prize_type, s.prize_value)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-muted-foreground">{fmtDate(s.created_at)}</p>
                    {s.source !== "daily" && (
                      <span className="inline-block mt-1 text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30">
                        {s.source}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Gift className="size-5 text-primary" />
            <h2 className="font-display text-lg tracking-wide">Daily claims</h2>
            <span className="ml-auto text-xs text-muted-foreground">{claims.length}</span>
          </div>
          {claims.length === 0 ? (
            <p className="text-sm text-muted-foreground">No claims yet.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {claims.map((c) => (
                <li key={c.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-sm">+{c.shekels_awarded} Shekels</p>
                    <p className="text-xs text-muted-foreground">Day {c.day_in_streak} of streak · {fmtDay(c.claim_date)}</p>
                  </div>
                  <span className="text-lg">💰</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
