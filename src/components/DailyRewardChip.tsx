import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Gift } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

/**
 * Pulsing chip surfaced on the Feed header that nudges the user to claim
 * their daily reward. Hides itself once today's claim is in.
 */
export default function DailyRewardChip() {
  const { user } = useAuth();
  const [claimedToday, setClaimedToday] = useState<boolean | null>(null);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("daily_streaks")
        .select("current_streak,last_claimed_date")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const today = new Date().toISOString().slice(0, 10);
      setClaimedToday(data?.last_claimed_date === today);
      setStreak((data?.current_streak as number | undefined) ?? 0);
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!user || claimedToday === null) return null;

  if (claimedToday) {
    return (
      <Link
        to="/rewards"
        aria-label={`Daily reward claimed — ${streak}-day streak`}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-card/60 border border-border text-muted-foreground hover:text-primary transition"
      >
        <Flame size={11} className="text-primary" />
        <span className="tabular-nums">{streak}d</span>
      </Link>
    );
  }

  return (
    <Link
      to="/rewards"
      aria-label="Claim your daily reward"
      className="relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-gradient-gold text-primary-foreground gold-shadow hover:brightness-110 transition"
    >
      <span className="absolute inset-0 rounded-full animate-ping bg-primary/40 -z-10" aria-hidden />
      <Gift size={12} />
      Claim reward
    </Link>
  );
}
