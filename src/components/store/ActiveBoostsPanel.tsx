import { useEffect, useState } from "react";
import { Zap, Shield, Sparkles, Star, Eye, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

interface ActiveBoost {
  id: string;
  boost_type: string;
  expires_at: string | null;
  started_at: string;
}

const ICON_MAP: Record<string, typeof Zap> = {
  royal_boost: Zap,
  vote_boost: Sparkles,
  crown_spotlight: Star,
  profile_glow: Eye,
  crown_shield: Shield,
};

const LABEL_MAP: Record<string, string> = {
  royal_boost: "Royal Boost",
  vote_boost: "Vote Boost",
  crown_spotlight: "Crown Spotlight",
  profile_glow: "Profile Glow",
  crown_shield: "Crown Shield",
};

function formatRemaining(expiresAt: string | null): string {
  if (!expiresAt) return "No expiry";

  const ms = new Date(expiresAt).getTime() - Date.now();

  if (ms <= 0) return "Expired";

  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;

  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;

  return `${m}m left`;
}

export default function ActiveBoostsPanel(): JSX.Element | null {
  const { user } = useAuth();
  const [boosts, setBoosts] = useState<ActiveBoost[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("boosts")
        .select("id, boost_type, expires_at, started_at")
        .eq("user_id", user.id)
        .eq("active", true)
        .order("started_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error("Failed to load boosts:", error);
        setLoading(false);
        return;
      }

      const now = Date.now();

      const live = (data ?? []).filter(
        (b) => !b.expires_at || new Date(b.expires_at).getTime() > now,
      );

      setBoosts(live as ActiveBoost[]);
      setLoading(false);
    })();

    const interval = setInterval(() => setTick((t) => t + 1), 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user?.id]);

  if (loading) {
    return (
      <div className="royal-card p-4 flex items-center justify-center text-muted-foreground text-xs">
        <Loader2 size={14} className="animate-spin mr-2" /> Checking active boosts…
      </div>
    );
  }

  if (boosts.length === 0) return null;

  return (
    <div className="royal-card p-4 space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm uppercase tracking-wider text-gold">
          Active Boosts
        </h2>

        <span className="text-[10px] text-muted-foreground">
          {boosts.length} running
        </span>
      </div>

      <div className="space-y-2">
        {boosts.map((b) => {
          const Icon = ICON_MAP[b.boost_type] ?? Zap;

          return (
            <div
              key={b.id}
              className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 border border-border/50"
            >
              <div className="size-9 rounded-lg bg-gradient-gold flex items-center justify-center text-primary-foreground">
                <Icon size={16} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">
                  {LABEL_MAP[b.boost_type] ?? b.boost_type}
                </p>

                <p className="text-[11px] text-muted-foreground">
                  {formatRemaining(b.expires_at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
