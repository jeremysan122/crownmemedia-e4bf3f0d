import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/hooks/useWallet";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { Link } from "react-router-dom";
import CrownLoader from "@/components/CrownLoader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CrownIcon } from "@/components/CrownIcon";
import { Flame, Swords, Sparkles, ArrowLeft, History } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptics";

type PrizeType = "shekels" | "battle_tickets" | "royal_pass_days" | "profile_boost_hours" | "bonus_spin" | "nothing";
type Prize = {
  id: string;
  label: string;
  prize_type: PrizeType;
  prize_value: number;
  weight: number;
  color_hex: string | null;
  sort_order: number;
};

const PRIZE_ICON: Record<PrizeType, string> = {
  shekels: "💰",
  battle_tickets: "⚔️",
  royal_pass_days: "👑",
  profile_boost_hours: "🚀",
  bonus_spin: "✨",
  nothing: "💤",
};

function shortLabel(p: Prize): string {
  switch (p.prize_type) {
    case "battle_tickets":     return p.prize_value === 1 ? "1 TICKET" : `${p.prize_value} TICKETS`;
    case "royal_pass_days":    return `PASS ${p.prize_value}d`;
    case "profile_boost_hours":return `BOOST ${p.prize_value}h`;
    case "bonus_spin":         return "BONUS SPIN";
    case "shekels":            return `+${p.prize_value}`;
    case "nothing":            return "TRY AGAIN";
    default:                   return p.label.toUpperCase();
  }
}

function rewardEffect(t: PrizeType, v: number): string {
  switch (t) {
    case "battle_tickets":     return `+${v} Battle Ticket${v === 1 ? "" : "s"} added to your balance.`;
    case "royal_pass_days":    return `Royal Pass extended by ${v} day${v === 1 ? "" : "s"}.`;
    case "profile_boost_hours":return `Profile Boost active for ${v}h — your profile shines on the feed.`;
    case "bonus_spin":         return "Bonus spin granted — use it right now!";
    case "shekels":            return `+${v} Shekels credited.`;
    case "nothing":            return "No prize this time — come back tomorrow.";
  }
}

type Streak = {
  current_streak: number;
  longest_streak: number;
  last_claimed_date: string | null;
  last_spin_date: string | null;
  total_claims: number;
  bonus_spins: number;
};

function todayUtc(): string { return new Date().toISOString().slice(0, 10); }

export default function Rewards() {
  const { user, loading: authLoading } = useAuth();
  const { refreshWallet } = useWallet();
  useSeoMeta({
    title: "Daily Rewards — CrownMe",
    description: "Claim your daily reward, build your streak, and spin the royal wheel for premium perks.",
  });

  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [tickets, setTickets] = useState<number>(0);
  const [claiming, setClaiming] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winFlash, setWinFlash] = useState(false);
  const [lastResult, setLastResult] = useState<{ label: string; prize_type: PrizeType; prize_value: number } | null>(null);

  const today = todayUtc();
  const claimedToday = streak?.last_claimed_date === today;
  const spunToday = streak?.last_spin_date === today;
  const bonusSpins = streak?.bonus_spins ?? 0;
  const canSpin = claimedToday && (!spunToday || bonusSpins > 0);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [s, p, t] = await Promise.all([
        supabase.from("daily_streaks").select("current_streak,longest_streak,last_claimed_date,last_spin_date,total_claims,bonus_spins").eq("user_id", user.id).maybeSingle(),
        supabase.from("spin_wheel_prizes").select("id,label,prize_type,prize_value,weight,color_hex,sort_order").eq("active", true).order("sort_order"),
        supabase.from("battle_tickets").select("balance").eq("user_id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      setStreak((s.data as Streak | null) ?? { current_streak: 0, longest_streak: 0, last_claimed_date: null, last_spin_date: null, total_claims: 0, bonus_spins: 0 });
      setPrizes((p.data as Prize[]) ?? []);
      setTickets((t.data?.balance as number | undefined) ?? 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  async function refreshTickets() {
    if (!user) return;
    const { data } = await supabase.from("battle_tickets").select("balance").eq("user_id", user.id).maybeSingle();
    setTickets((data?.balance as number | undefined) ?? 0);
  }

  async function claim() {
    if (claiming || claimedToday) return;
    setClaiming(true);
    const { data, error } = await supabase.rpc("claim_daily_reward");
    setClaiming(false);
    if (error) { toast.error(error.message); return; }
    const res = data as { ok: boolean; shekels_awarded?: number; current_streak?: number; longest_streak?: number; already_claimed?: boolean };
    if (res.already_claimed) toast.info("Already claimed today — come back tomorrow.");
    else { haptic("success"); toast.success(`+${res.shekels_awarded} shekels · ${res.current_streak}-day streak 🔥`); }
    setStreak((prev) => prev ? { ...prev, current_streak: res.current_streak ?? prev.current_streak, longest_streak: res.longest_streak ?? prev.longest_streak, last_claimed_date: today } : prev);
  }

  async function spin() {
    if (spinning || !canSpin || prizes.length === 0) return;
    setSpinning(true);
    setLastResult(null);
    haptic("medium");
    const { data, error } = await supabase.rpc("spin_daily_wheel");
    if (error) { setSpinning(false); toast.error(error.message); return; }
    const res = data as { ok: boolean; prize_id: string; label: string; prize_type: PrizeType; prize_value: number; used_bonus: boolean; bonus_spins_remaining: number };
    const idx = prizes.findIndex((p) => p.id === res.prize_id);
    const slice = 360 / prizes.length;
    const targetCenter = idx * slice + slice / 2;
    const finalRot = 360 * 6 + (360 - targetCenter);
    setRotation((prev) => prev - (prev % 360) + finalRot);

    window.setTimeout(async () => {
      setSpinning(false);
      setLastResult({ label: res.label, prize_type: res.prize_type, prize_value: res.prize_value });
      setWinFlash(true);
      window.setTimeout(() => setWinFlash(false), 1800);
      haptic(res.prize_type === "nothing" ? "warning" : "success");
      setStreak((prev) => prev ? {
        ...prev,
        last_spin_date: res.used_bonus ? prev.last_spin_date : today,
        bonus_spins: res.bonus_spins_remaining ?? prev.bonus_spins,
      } : prev);
      if (res.prize_type === "battle_tickets") await refreshTickets();
      toast.success(`You won: ${res.label}`);
    }, 4200);
  }

  // Wheel with auto-fit labels (textLength + lengthAdjust scales glyphs to fit each wedge)
  const wheel = useMemo(() => {
    if (prizes.length === 0) return null;
    const size = 320;
    const cx = size / 2, cy = size / 2;
    const rOuter = size / 2 - 4;
    const rInner = 28;
    const slice = (2 * Math.PI) / prizes.length;

    // Estimate the safe chord at the label radius so text never overflows the wedge sides.
    const labelR = (rOuter - 8) * 0.46;
    const sidePadding = 6;
    const maxLabelWidth = Math.max(40, 2 * labelR * Math.sin(slice / 2) - sidePadding);

    return (
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%"
           style={{
             transform: `rotate(${rotation}deg)`,
             transition: spinning ? "transform 4s cubic-bezier(0.18,0.84,0.16,1)" : "none",
             maxWidth: size, maxHeight: size,
           }}
           className="drop-shadow-[0_0_45px_hsl(43_95%_60%/0.55)]"
           aria-label="Royal spin wheel">
        <defs>
          <radialGradient id="wheel-rim" cx="50%" cy="50%" r="50%">
            <stop offset="88%" stopColor="hsl(43 90% 65%)" />
            <stop offset="96%" stopColor="hsl(43 78% 45%)" />
            <stop offset="100%" stopColor="hsl(38 60% 28%)" />
          </radialGradient>
          <radialGradient id="wheel-hub" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(43 100% 78%)" />
            <stop offset="100%" stopColor="hsl(38 70% 32%)" />
          </radialGradient>
          {prizes.map((p) => (
            <radialGradient key={`g-${p.id}`} id={`wedge-${p.id}`} cx="50%" cy="50%" r="80%">
              <stop offset="0%" stopColor={p.color_hex ?? "#444"} stopOpacity="1" />
              <stop offset="100%" stopColor={p.color_hex ?? "#444"} stopOpacity="0.78" />
            </radialGradient>
          ))}
        </defs>

        {/* Outer gold rim + inner ring */}
        <circle cx={cx} cy={cy} r={rOuter} fill="url(#wheel-rim)" />
        <circle cx={cx} cy={cy} r={rOuter - 6} fill="hsl(43 50% 18%)" />

        {prizes.map((p, i) => {
          const a0 = i * slice - Math.PI / 2;
          const a1 = a0 + slice;
          const r = rOuter - 8;
          const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
          const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
          const large = slice > Math.PI ? 1 : 0;
          const path = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
          const mid = a0 + slice / 2;

          const iconR = r * 0.78;
          const ix = cx + iconR * Math.cos(mid);
          const iy = cy + iconR * Math.sin(mid);
          const lx = cx + labelR * Math.cos(mid);
          const ly = cy + labelR * Math.sin(mid);

          let rotDeg = (mid * 180) / Math.PI;
          const flip = rotDeg > 90 && rotDeg < 270;
          const textRot = flip ? rotDeg + 180 : rotDeg;

          const label = shortLabel(p);
          return (
            <g key={p.id}>
              <path d={path} fill={`url(#wedge-${p.id})`} stroke="hsl(43 70% 30%)" strokeWidth={1.5} />
              <text
                x={ix} y={iy}
                transform={`rotate(${textRot} ${ix} ${iy})`}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={18}
                style={{ pointerEvents: "none" }}
              >
                {PRIZE_ICON[p.prize_type] ?? "🎁"}
              </text>
              <text
                x={lx} y={ly}
                transform={`rotate(${textRot} ${lx} ${ly})`}
                textAnchor="middle" dominantBaseline="middle"
                fill="#0a0a0a"
                fontSize={11}
                fontWeight={800}
                letterSpacing="0.4"
                textLength={maxLabelWidth}
                lengthAdjust="spacingAndGlyphs"
                style={{ pointerEvents: "none", fontFamily: "ui-sans-serif, system-ui" }}
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* Inner gold hub */}
        <circle cx={cx} cy={cy} r={rInner + 5} fill="hsl(43 60% 18%)" />
        <circle cx={cx} cy={cy} r={rInner} fill="url(#wheel-hub)" stroke="hsl(43 95% 72%)" strokeWidth={1.5} />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize={24} style={{ pointerEvents: "none" }}>👑</text>
      </svg>
    );
  }, [prizes, rotation, spinning]);

  if (authLoading || loading || !streak) return <CrownLoader label="Loading rewards…" />;

  const nextClaimMs = (() => {
    if (!claimedToday) return 0;
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    return tomorrow.getTime() - Date.now();
  })();

  return (
    <main className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-10 backdrop-blur bg-background/70 border-b border-border/40">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/feed" aria-label="Back" className="p-2 -ml-2 rounded-full hover:bg-muted"><ArrowLeft className="size-5" /></Link>
          <h1 className="font-display text-lg tracking-widest">DAILY REWARDS</h1>
          <Link to="/rewards/history" aria-label="Reward history" className="p-2 -mr-2 rounded-full hover:bg-muted"><History className="size-5" /></Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
        {/* Streak header */}
        <Card className="p-5 bg-gradient-to-br from-primary/10 via-background to-background border-primary/30">
          <div className="flex items-center gap-4">
            <div className="size-16 rounded-2xl bg-gradient-gold flex items-center justify-center gold-shadow shrink-0">
              <Flame className="size-8 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Current streak</p>
              <p className="text-3xl font-display font-bold leading-none">{streak.current_streak} <span className="text-base text-muted-foreground font-normal">day{streak.current_streak === 1 ? "" : "s"}</span></p>
              <p className="text-xs text-muted-foreground mt-1">Best: {streak.longest_streak} · Total check-ins: {streak.total_claims}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-center justify-end gap-1 text-sm font-semibold">
                <Swords className="size-4 text-primary" />
                <span className="tabular-nums">{tickets}</span>
              </div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">tickets</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }).map((_, i) => {
              const day = i + 1;
              const reached = streak.current_streak >= day;
              const reward = 50 + day * 10;
              return (
                <div key={day} className={`relative rounded-lg border text-center py-2 transition ${reached ? "bg-primary/20 border-primary/60" : "bg-muted/30 border-border"}`}>
                  <div className="text-[10px] text-muted-foreground">Day {day}</div>
                  <div className={`text-xs font-bold ${reached ? "text-primary" : "text-foreground/60"}`}>+{reward}</div>
                </div>
              );
            })}
          </div>

          <Button
            onClick={claim}
            disabled={claiming || claimedToday}
            className="w-full mt-5 h-12 font-bold tracking-wide bg-gradient-gold text-primary-foreground gold-shadow disabled:opacity-60"
          >
            {claimedToday
              ? `Claimed · next in ${Math.max(1, Math.floor(nextClaimMs / 3600000))}h ${Math.max(0, Math.floor((nextClaimMs % 3600000) / 60000))}m`
              : claiming ? "Claiming…" : "Claim today's reward"}
          </Button>
        </Card>

        {/* Wheel */}
        <Card className="p-5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              <h2 className="font-display text-lg tracking-wide">Royal Spin Wheel</h2>
            </div>
            {bonusSpins > 0 && (
              <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-primary/20 border border-primary/40 text-primary font-bold">
                +{bonusSpins} bonus
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            {!claimedToday
              ? "Claim your daily reward first to unlock your spin."
              : canSpin
                ? (bonusSpins > 0 && spunToday ? "Bonus spin ready — fire away!" : "One free spin available today.")
                : "You already spun today — come back tomorrow."}
          </p>

          <div className="relative flex flex-col items-center">
            {/* Ambient gold glow ring */}
            <div className={`absolute inset-0 rounded-full pointer-events-none transition-opacity duration-700 ${spinning || winFlash ? "opacity-100 animate-pulse" : "opacity-50"}`}
                 style={{ background: "radial-gradient( circle at 50% 50%, hsl(43 95% 60% / 0.35), transparent 60%)" }}
                 aria-hidden />

            {/* Pointer */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
                 style={{ width: 0, height: 0, borderLeft: "14px solid transparent", borderRight: "14px solid transparent", borderTop: "22px solid hsl(var(--primary))" }}
                 aria-hidden />

            <div className="pt-4 relative w-full max-w-[320px] aspect-square">
              {wheel}

              {/* Win flourish */}
              {winFlash && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="absolute inset-0 rounded-full animate-ping bg-primary/20" />
                  <CrownIcon className="size-20 text-primary animate-[scale-in_0.4s_ease-out] drop-shadow-[0_0_24px_hsl(43_95%_70%/0.9)]" />
                </div>
              )}
            </div>
          </div>

          <Button
            onClick={spin}
            disabled={spinning || !canSpin || prizes.length === 0}
            className="w-full mt-5 h-12 font-bold tracking-wide bg-gradient-gold text-primary-foreground gold-shadow disabled:opacity-60 relative overflow-hidden"
          >
            <span className="relative z-10">
              {spinning ? "Spinning…" : !claimedToday ? "Locked — claim first" : !canSpin ? "Already spun today" : bonusSpins > 0 && spunToday ? `Use bonus spin (${bonusSpins})` : "Spin the wheel"}
            </span>
          </Button>

          {lastResult && (
            <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-primary/15 via-primary/5 to-background border border-primary/40 text-center animate-[fade-in_0.4s_ease-out]">
              <div className="text-2xl mb-1">{PRIZE_ICON[lastResult.prize_type]}</div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">You won</p>
              <p className="font-display text-xl text-primary">{lastResult.label}</p>
              <p className="text-xs text-muted-foreground mt-2">{rewardEffect(lastResult.prize_type, lastResult.prize_value)}</p>
              <Link to="/rewards/history" className="inline-block mt-3 text-[11px] uppercase tracking-widest text-primary hover:underline">View history →</Link>
            </div>
          )}
        </Card>

        {/* Prize odds */}
        <Card className="p-5">
          <h3 className="font-semibold mb-3 text-sm tracking-wide uppercase text-muted-foreground">Prize odds</h3>
          <ul className="space-y-2">
            {(() => {
              const total = prizes.reduce((s, p) => s + p.weight, 0) || 1;
              return prizes.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="inline-block size-3 rounded-sm" style={{ backgroundColor: p.color_hex ?? "#444" }} aria-hidden />
                    {p.label}
                  </span>
                  <span className="text-muted-foreground tabular-nums">{((p.weight / total) * 100).toFixed(1)}%</span>
                </li>
              ));
            })()}
          </ul>
        </Card>
      </div>
    </main>
  );
}
