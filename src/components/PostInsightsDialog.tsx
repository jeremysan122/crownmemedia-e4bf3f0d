import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Crown, Flame, Gem, MessageCircle, Share2, Swords, Gift, Loader2, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatScore, timeAgo } from "@/lib/crown";

interface Props {
  postId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  base: {
    crown_score: number;
    vote_count: number;
    comment_count: number;
    share_count: number;
    battle_wins: number;
    created_at: string;
  };
}

interface VoteBreakdown { crown: number; fire: number; diamond: number }
interface GiftStat { gift_name: string; quantity: number; total_shekels: number }

/**
 * Owner-only post insights. Pulls live vote-type breakdown + gifts received.
 * Read-only; counts can be slightly behind cached `crown_score` during a write.
 */
export default function PostInsightsDialog({ postId, open, onOpenChange, base }: Props) {
  const [loading, setLoading] = useState(true);
  const [votes, setVotes] = useState<VoteBreakdown>({ crown: 0, fire: 0, diamond: 0 });
  const [gifts, setGifts] = useState<GiftStat[]>([]);
  const [giftTotalShekels, setGiftTotalShekels] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: stats }, { data: giftRows }] = await Promise.all([
        supabase.rpc("get_post_vote_stats", { _post_id: postId }),
        supabase
          .from("gift_transactions")
          .select("gift_name, quantity, total_shekels")
          .eq("post_id", postId)
          .eq("status", "completed"),
      ]);
      if (cancelled) return;
      const counts = ((stats ?? {}) as { counts?: Record<string, number> }).counts ?? {};
      const vb: VoteBreakdown = {
        crown: counts.crown ?? 0,
        fire: counts.fire ?? 0,
        diamond: counts.diamond ?? 0,
      };
      setVotes(vb);
      const agg = new Map<string, GiftStat>();
      let total = 0;
      (giftRows ?? []).forEach((g: any) => {
        const name = String(g.gift_name ?? "Gift");
        const qty = Number(g.quantity) || 0;
        const sh = Number(g.total_shekels) || 0;
        total += sh;
        const cur = agg.get(name) ?? { gift_name: name, quantity: 0, total_shekels: 0 };
        cur.quantity += qty;
        cur.total_shekels += sh;
        agg.set(name, cur);
      });
      setGifts(Array.from(agg.values()).sort((a, b) => b.total_shekels - a.total_shekels));
      setGiftTotalShekels(total);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, postId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            <TrendingUp size={18} className="text-primary" /> Post Insights
          </DialogTitle>
        </DialogHeader>

        <p className="text-[11px] text-muted-foreground -mt-2">
          Posted {timeAgo(base.created_at)} • Visible only to you
        </p>

        {/* Headline score */}
        <div className="rounded-xl border border-primary/30 bg-card/60 p-4 text-center">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Crown Score</p>
          <p className="font-display text-4xl text-gold mt-1">{formatScore(base.crown_score)}</p>
        </div>

        {/* Vote breakdown */}
        <div>
          <h4 className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Votes by tier</h4>
          {loading ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <StatTile icon={<Crown size={16} />} label="Crown" value={votes.crown} accent="text-gold" />
              <StatTile icon={<Flame size={16} />} label="Fire" value={votes.fire} accent="text-orange-400" />
              <StatTile icon={<Gem size={16} />} label="Diamond" value={votes.diamond} accent="text-cyan-300" />
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Total votes (cached): <span className="tabular-nums">{base.vote_count}</span>
          </p>
        </div>

        {/* Engagement */}
        <div>
          <h4 className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Engagement</h4>
          <div className="grid grid-cols-3 gap-2">
            <StatTile icon={<MessageCircle size={16} />} label="Comments" value={base.comment_count} />
            <StatTile icon={<Share2 size={16} />} label="Shares" value={base.share_count} />
            <StatTile icon={<Swords size={16} />} label="Battle wins" value={base.battle_wins} />
          </div>
        </div>

        {/* Gifts */}
        <div>
          <h4 className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
            <Gift size={12} /> Gifts received
          </h4>
          {loading ? (
            <div className="flex items-center justify-center py-3 text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
            </div>
          ) : gifts.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No gifts yet.</p>
          ) : (
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">
                Total: <span className="font-bold text-foreground tabular-nums">{giftTotalShekels.toLocaleString()}</span> shekels
              </div>
              <ul className="divide-y divide-border rounded-lg border border-border bg-card/40">
                {gifts.slice(0, 8).map((g) => (
                  <li key={g.gift_name} className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <span>{g.gift_name} <span className="text-muted-foreground">× {g.quantity}</span></span>
                    <span className="tabular-nums text-gold font-semibold">{g.total_shekels.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatTile({
  icon, label, value, accent,
}: { icon: React.ReactNode; label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-2.5 text-center">
      <div className={`flex items-center justify-center gap-1 ${accent ?? "text-foreground"}`}>
        {icon}
        <span className="font-bold tabular-nums text-sm">{value.toLocaleString()}</span>
      </div>
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
