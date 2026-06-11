import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/hooks/useWallet";
import { walletStore } from "@/stores/walletStore";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { Link } from "react-router-dom";
import CrownLoader from "@/components/CrownLoader";
import { CrownIcon } from "@/components/CrownIcon";
import { Flame, Swords, Sparkles, ArrowLeft, History, Loader2 } from "lucide-react";
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
  const { refreshWallet, applyDelta } = useWallet();
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
    const res = data as { ok: boolean; shekels_awarded?: number; bonus?: number; current_streak?: number; longest_streak?: number; already_claimed?: boolean };
    if (res.already_claimed) toast.info("Already claimed today — come back tomorrow.");
    else {
      haptic("success");
      const bonusTxt = res.bonus && res.bonus > 0 ? ` (+${res.bonus} bonus!)` : "";
      toast.success(`+${res.shekels_awarded} shekels${bonusTxt} · ${res.current_streak}-day streak 🔥`);
      // Optimistic instant bump so the header pill reflects the new balance immediately,
      // then a server refresh confirms the authoritative number.
      if (res.shekels_awarded) applyDelta(res.shekels_awarded);
      await refreshWallet();
      walletStore.requestRefresh();
    }
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
      if (res.prize_type === "shekels") {
        if (res.prize_value) applyDelta(res.prize_value);
        await refreshWallet();
        walletStore.requestRefresh();
      }
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

    // Center labels at the radial midpoint of each wedge so text and icon sit centered in their section.
    const midR = (rInner + rOuter) / 2;
    const labelR = midR;
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

          // Orient text tangentially (perpendicular to the spoke) so the label
          // reads across the wedge — this is the orientation that actually
          // matches `maxLabelWidth` (chord at labelR) and keeps icon + label
          // visually centered inside each section.
          const cosM = Math.cos(mid), sinM = Math.sin(mid);
          const iconRadialOffset = -12; // icon sits slightly closer to the hub
          const labelRadialOffset = 10; // label sits slightly toward the rim
          const ix = cx + (labelR + iconRadialOffset) * cosM;
          const iy = cy + (labelR + iconRadialOffset) * sinM;
          const lx = cx + (labelR + labelRadialOffset) * cosM;
          const ly = cy + (labelR + labelRadialOffset) * sinM;

          const rotDeg = (mid * 180) / Math.PI + 90;
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

  // Day mapping for the 7-day track:
  //   - "claimed" : day index <= number of days already fully claimed in the current cycle
  //   - "today"   : the next slot to claim (only when not yet claimed today)
  //   - "locked"  : everything else
  const cycleDay = streak.current_streak === 0 ? 0 : ((streak.current_streak - 1) % 7) + 1;
  const fullyClaimedThisCycle = claimedToday ? cycleDay : ((streak.current_streak) % 7);
  const todaySlot = claimedToday ? null : Math.min(7, fullyClaimedThisCycle + 1);
  const dayReward = (day: number) => day === 7 ? "+100" : `+${10 + (day - 1) * 5}`;

  return (
    <main className="min-h-screen bg-[#0a0510] pb-28">
      <header className="sticky top-0 z-20 backdrop-blur bg-[#0a0510]/80 border-b border-amber-500/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/feed" aria-label="Back" className="p-2 -ml-2 rounded-full hover:bg-white/5 text-white/70 hover:text-white"><ArrowLeft className="size-5" /></Link>
          <h1 className="font-display text-base sm:text-lg tracking-[0.3em] text-amber-400">ROYAL VAULT</h1>
          <Link to="/rewards/history" aria-label="Reward history" className="p-2 -mr-2 rounded-full hover:bg-white/5 text-white/70 hover:text-white"><History className="size-5" /></Link>
        </div>
      </header>

      <div className="max-w-lg md:max-w-3xl lg:max-w-6xl mx-auto px-4 sm:px-6 pt-6">
        <div className="relative bg-gradient-to-b from-[#1a1033] to-[#0a0510] rounded-[2.5rem] p-5 sm:p-8 lg:p-10 border-2 border-amber-500/20 shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden">
          {/* Background glows */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-amber-500/10 blur-[100px] pointer-events-none" aria-hidden />
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-purple-700/15 blur-[100px] pointer-events-none" aria-hidden />

          {/* Header */}
          <div className="relative text-center space-y-1 mb-7">
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight">Royal Vault</h2>
            <p className="text-amber-400 text-xs sm:text-sm font-semibold tracking-[0.25em] uppercase">Daily Rewards</p>
          </div>

          <div className="relative grid gap-7 lg:grid-cols-2 lg:gap-10 lg:items-start">
           <div className="space-y-7">
          {/* Streak summary chips */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <div className="flex items-center justify-center gap-1 text-amber-400">
                <Flame className="size-4" />
                <span className="text-lg font-bold tabular-nums">{streak.current_streak}</span>
              </div>
              <p className="text-[9px] uppercase tracking-widest text-white/50 mt-0.5">Streak</p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <p className="text-lg font-bold tabular-nums text-white">{streak.longest_streak}</p>
              <p className="text-[9px] uppercase tracking-widest text-white/50 mt-0.5">Best</p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <div className="flex items-center justify-center gap-1 text-amber-400">
                <Swords className="size-4" />
                <span className="text-lg font-bold tabular-nums">{tickets}</span>
              </div>
              <p className="text-[9px] uppercase tracking-widest text-white/50 mt-0.5">Tickets</p>
            </div>
          </div>

          {/* 7-Day Streak Track */}
          <section className="relative space-y-3" aria-label="7-day streak track">
            <div className="flex justify-between items-end px-1">
              <h3 className="text-white font-bold text-sm">7-Day Streak</h3>
              <span className="text-amber-400 text-[10px] font-bold bg-amber-400/10 px-2 py-1 rounded-full">
                Day {Math.max(1, cycleDay || todaySlot || 1)} of 7
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 6 }).map((_, i) => {
                const day = i + 1;
                const isClaimed = day <= fullyClaimedThisCycle;
                const isToday = todaySlot === day;
                const reward = dayReward(day);
                return (
                  <div
                    key={day}
                    className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center space-y-1 transition
                      ${isClaimed ? "bg-emerald-500/10 border border-emerald-500/30" :
                        isToday ? "bg-gradient-to-br from-amber-400 to-amber-600 border-2 border-white/30 shadow-[0_0_20px_rgba(251,191,36,0.4)] animate-pulse" :
                        "bg-white/5 border border-white/10 opacity-60"}`}
                  >
                    {isClaimed && (
                      <div className="absolute -top-1 -right-1 bg-emerald-500 rounded-full p-0.5">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </div>
                    )}
                    <span className={`text-[10px] font-bold uppercase ${isClaimed ? "text-emerald-400" : isToday ? "text-white" : "text-white/40"}`}>Day {day}</span>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center
                      ${isClaimed ? "bg-emerald-400/20" : isToday ? "bg-white/25" : "bg-white/10"}`}>
                      <div className={`rounded-full
                        ${isClaimed ? "w-3 h-3 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" :
                          isToday ? "w-4 h-4 bg-white" :
                          "w-3 h-3 bg-white/20"}`} />
                    </div>
                    <span className={`text-[10px] font-black ${isClaimed ? "text-emerald-300" : isToday ? "text-white" : "text-white/40"}`}>{reward}</span>
                  </div>
                );
              })}

              {/* Day 7 — Grand prize, spans 2 cols */}
              {(() => {
                const day = 7;
                const isClaimed = day <= fullyClaimedThisCycle;
                const isToday = todaySlot === day;
                return (
                  <div className={`col-span-2 relative aspect-[2/1] rounded-2xl bg-gradient-to-br from-[#2a1b4d] to-[#1a1033] border flex items-center justify-between px-4 overflow-hidden
                    ${isToday ? "border-amber-400/80 shadow-[0_0_24px_rgba(245,158,11,0.4)] animate-pulse" : "border-amber-500/50"}
                    ${isClaimed ? "opacity-90" : ""}`}>
                    <div className="absolute inset-0 bg-amber-500/5" aria-hidden />
                    <div className="relative">
                      <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">Grand Prize</span>
                      <span className="text-white font-black text-base leading-tight">DAY 7</span>
                      <span className="text-[10px] text-white/60 block">+ random bonus</span>
                    </div>
                    <div className="relative flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.6)] flex items-center justify-center">
                        <CrownIcon className="size-5 text-[#1a1033]" />
                      </div>
                      <span className="text-amber-400 font-black text-base">+100</span>
                    </div>
                    {isClaimed && (
                      <div className="absolute -top-1 -right-1 bg-emerald-500 rounded-full p-0.5 z-10">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <p className="text-[10px] text-white/40 text-center">
              Every 7th consistent day grants a random bonus (50–200 shekels).
            </p>
          </section>

          {/* Claim CTA */}
          <button
            type="button"
            onClick={claim}
            disabled={claiming || claimedToday}
            aria-busy={claiming}
            className={`w-full group relative py-5 rounded-2xl shadow-[0_10px_30px_rgba(217,119,6,0.3)] transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100
              ${claimedToday ? "bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-700" : "bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600"}`}
          >
            <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 group-disabled:opacity-0 transition-opacity rounded-2xl" />
            <span className="relative text-white font-black text-base sm:text-lg tracking-wider uppercase inline-flex items-center justify-center gap-2">
              {claiming ? (<><Loader2 className="size-4 animate-spin" /> Claiming…</>) :
                claimedToday ? `Claimed · next in ${Math.max(1, Math.floor(nextClaimMs / 3600000))}h ${Math.max(0, Math.floor((nextClaimMs % 3600000) / 60000))}m` :
                "Claim Today's Chips"}
            </span>
          </button>

          <p className="text-[11px] text-white/50 text-center -mt-3">
            Earn shekels through daily rewards or top up anytime in the store.
          </p>
           </div>

           <div className="space-y-7">
          {/* Royal Spin Wheel */}
          <section className="relative pt-2 space-y-5" aria-label="Royal spin wheel">
            <div className="relative flex flex-col items-center">
              <div className="absolute -top-2 bg-[#1a1033] border border-amber-500/30 px-4 py-1 rounded-full z-10 shadow-lg flex items-center gap-2">
                <Sparkles className="size-3 text-amber-400" />
                <span className="text-amber-400 text-xs font-bold uppercase tracking-widest">Royal Spin</span>
                {bonusSpins > 0 && (
                  <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300">+{bonusSpins}</span>
                )}
              </div>

              <p className="text-[11px] text-white/60 text-center mt-7 mb-3">
                {!claimedToday
                  ? "Claim your daily reward first to unlock your spin."
                  : canSpin
                    ? (bonusSpins > 0 && spunToday ? "Bonus spin ready — fire away!" : "One free spin available today.")
                    : "You already spun today — come back tomorrow."}
              </p>

              <div className="relative w-full max-w-[280px] sm:max-w-[360px] lg:max-w-[420px] aspect-square mx-auto">
                {/* Pointer */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-20 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
                     style={{ width: 0, height: 0, borderLeft: "14px solid transparent", borderRight: "14px solid transparent", borderTop: "22px solid hsl(43 95% 60%)" }}
                     aria-hidden />
                {wheel}

                {winFlash && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="absolute inset-0 rounded-full animate-ping bg-amber-400/20" />
                    <CrownIcon className="size-20 text-amber-400 animate-[scale-in_0.4s_ease-out] drop-shadow-[0_0_24px_hsl(43_95%_70%/0.9)]" />
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={spin}
              disabled={spinning || !canSpin || prizes.length === 0}
              aria-busy={spinning}
              className="w-full group relative py-4 bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600 rounded-2xl shadow-[0_10px_30px_rgba(217,119,6,0.3)] transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed"
            >
              <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 group-disabled:opacity-0 transition-opacity rounded-2xl" />
              <span className="relative text-white font-black text-sm sm:text-base tracking-wider uppercase inline-flex items-center justify-center gap-2">
                {spinning && <Loader2 className="size-4 animate-spin" />}
                {spinning ? "Spinning…" :
                  !claimedToday ? "Locked — claim first" :
                  !canSpin ? "Already spun today" :
                  bonusSpins > 0 && spunToday ? `Use bonus spin (${bonusSpins})` :
                  "Spin the wheel"}
              </span>
            </button>

            {lastResult && (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/40 text-center animate-[fade-in_0.4s_ease-out]">
                <div className="text-3xl mb-1">{PRIZE_ICON[lastResult.prize_type]}</div>
                <p className="text-[10px] uppercase tracking-widest text-white/50">You won</p>
                <p className="font-display text-xl text-amber-300">{lastResult.label}</p>
                <p className="text-xs text-white/60 mt-2">{rewardEffect(lastResult.prize_type, lastResult.prize_value)}</p>
                <Link to="/rewards/history" className="inline-block mt-3 text-[11px] uppercase tracking-widest text-amber-400 hover:underline">View history →</Link>
              </div>
            )}
          </section>

          {/* Prize odds */}
          <section className="relative bg-white/5 rounded-2xl p-4 border border-white/10" aria-label="Prize odds">
            <h3 className="text-white/60 text-[10px] font-bold uppercase tracking-[0.2em] mb-3 text-center">Prize Probabilities</h3>
            {(() => {
              const total = prizes.reduce((s, p) => s + p.weight, 0) || 1;
              return (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                  {prizes.map((p) => (
                    <li key={p.id} className="flex justify-between items-center border-b border-white/5 pb-1.5">
                      <span className="flex items-center gap-2 text-white/80 text-xs">
                        <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: p.color_hex ?? "#888" }} aria-hidden />
                        {p.label}
                      </span>
                      <span className="text-amber-400 text-xs font-bold tabular-nums">{((p.weight / total) * 100).toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </section>
           </div>
          </div>

          <p className="relative text-center text-white/30 text-[10px] uppercase tracking-[0.2em] mt-7">
            Resets daily at 00:00 UTC · Good luck, royal
          </p>
        </div>
      </div>
    </main>
  );
}
