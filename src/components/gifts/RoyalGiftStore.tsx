import { useMemo, useState } from "react";
import { Search, TrendingUp, Crown, Send, ShoppingCart, Wallet, Heart, Loader2, MessageCircle } from "lucide-react";
import { ROYAL_GIFTS, SHEKEL, formatShekels, shekelToUsd, CATEGORY_TABS, findGift } from "@/lib/gifts";
import { GiftCategory, RoyalGift } from "@/types/gifts";
import { useWallet } from "@/hooks/useWallet";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AddShekelsModal from "./AddShekelsModal";
import GiftAnimationOverlay from "./GiftAnimationOverlay";
import { GiftIcon } from "./GiftIcon";
import { useGiftFavorites } from "@/hooks/useGiftFavorites";
import { fxGiftPreview, fxGiftSend, fxPurchase, fxTap, unlockAudio } from "@/lib/giftFx";
import DailyDealCard from "@/components/store/DailyDealCard";
import GiftTargetPicker from "./GiftTargetPicker";
import GiftDmPicker, { type GiftDmRecipient } from "./GiftDmPicker";
import { supabase } from "@/integrations/supabase/client";
import { makeGiftIdempotencyKey, useGiftSend } from "@/hooks/useGiftSend";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { RecentGiftTarget } from "@/lib/recentGiftTargets";

const ALL_TABS: { key: GiftCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  ...CATEGORY_TABS,
];

export default function RoyalGiftStore() {
  const { wallet, refreshWallet, applyDelta } = useWallet();
  const navigate = useNavigate();
  const [tab, setTab] = useState<GiftCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [previewing, setPreviewing] = useState<RoyalGift | null>(null);
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [pendingGift, setPendingGift] = useState<RoyalGift | null>(null);
  const [giftTarget, setGiftTarget] = useState<RecentGiftTarget | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const { pinFront, favorites } = useGiftFavorites();
  const { sendGift } = useGiftSend();

  const performSend = async (gift: RoyalGift, target: RecentGiftTarget, idempotencyKey = makeGiftIdempotencyKey()): Promise<boolean> => {
    setSending(true);
    const total = gift.shekelCost;
    applyDelta(-total, total);
    try {
      await sendGift({ gift, recipientId: target.userId, postId: target.id, quantity: 1, idempotencyKey });
      fxGiftSend(gift.category);
      toast.success(`Sent ${gift.name} to @${target.username}`, {
        description: `${SHEKEL}${formatShekels(total)} · They'll be notified instantly`,
      });
      refreshWallet();
      setSending(false);
      return true;
    } catch (e) {
      applyDelta(total, -total);
      refreshWallet();
      const msg = e instanceof Error ? e.message : "Gift could not be sent";
      toast.error("Gift failed to send", {
        description: msg,
        action: {
          label: "Retry",
          onClick: () => {
            void performSend(gift, target, idempotencyKey);
          },
        },
        duration: 8000,
      });
      setSending(false);
      return false;
    }
  };


  const favoriteGifts = useMemo(
    () => favorites.map((id) => findGift(id)).filter(Boolean) as RoyalGift[],
    [favorites],
  );
  const trending = useMemo(() => ROYAL_GIFTS.filter((g) => g.trending), []);
  const topPicks = useMemo(() => ROYAL_GIFTS.filter((g) => g.topPick), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ROYAL_GIFTS.filter((g) => {
      if (tab !== "all" && g.category !== tab) return false;
      if (q && !g.name.toLowerCase().includes(q) && !g.id.includes(q)) return false;
      return true;
    });
  }, [tab, query]);

  return (
    <div className="space-y-5">
      {/* Wallet bar */}
      <div className="royal-card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-gradient-gold flex items-center justify-center text-primary-foreground">
            <Wallet size={20} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Your Royal Wallet</p>
            <p className="font-display text-2xl text-gold leading-none mt-1 tabular-nums">
              {SHEKEL} {formatShekels(wallet.shekelBalance)}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2.5 rounded-full bg-gradient-gold text-primary-foreground font-bold text-sm gold-shadow active:scale-95"
        >
          + Add Shekels
        </button>
      </div>

      {/* Daily Deal */}
      <DailyDealCard onSelect={setPreviewing} />

      {/* Favorites rail */}
      {favoriteGifts.length > 0 && (
        <Section
          icon={<Heart size={16} className="text-primary fill-current" />}
          title="Your Favorites"
          gifts={favoriteGifts}
          onPreview={setPreviewing}
        />
      )}

      {/* Trending row */}
      {trending.length > 0 && (
        <Section
          icon={<TrendingUp size={16} className="text-primary" />}
          title="Trending Gifts"
          gifts={trending}
          onPreview={setPreviewing}
        />
      )}

      {/* Top spender picks */}
      {topPicks.length > 0 && (
        <Section
          icon={<Crown size={16} className="text-primary" />}
          title="Top Spender Picks"
          gifts={topPicks}
          onPreview={setPreviewing}
        />
      )}

      {/* Search + tabs */}
      <div className="space-y-3">
        <label className="relative block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 100 royal gifts…"
            className="w-full h-11 pl-10 pr-4 rounded-full bg-input/70 border border-border focus:border-primary/60 focus:outline-none text-sm"
          />
        </label>

        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1">
          {ALL_TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
                  active
                    ? "bg-gradient-gold text-primary-foreground gold-shadow"
                    : "bg-muted/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
        {filtered.map((g) => (
          <StoreGiftCard key={g.id} gift={g} onPreview={setPreviewing} />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-center text-sm text-muted-foreground py-12">
            No gifts found.
          </p>
        )}
      </div>

      <p className="text-center text-[10px] text-muted-foreground pt-2">
        100 gifts · 1 ₪ = $0.01 · Send from any post or profile
      </p>

      <AddShekelsModal
        open={showAdd}
        onOpenChange={(o) => {
          setShowAdd(o);
          if (!o) refreshWallet();
        }}
      />

      {/* Preview modal */}
      {previewing && (
        <div
          className="fixed inset-0 z-[80] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setPreviewing(null)}
        >
          <div
            className="relative w-full max-w-sm royal-card p-6 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <GiftAnimationOverlay
              gift={previewing}
              quantity={1}
              onDone={() => {/* keep open until user closes */}}
              anchored
            />
            <div className="relative z-10 flex flex-col items-center text-center gap-2 pt-24">
              <p className="font-display text-xl text-gold">{previewing.name}</p>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {previewing.rarity} · {previewing.category}
              </p>
              <p className="text-2xl font-bold tabular-nums">
                <span className="text-gold mr-1">{SHEKEL}</span>
                {formatShekels(previewing.shekelCost)}
                <span className="text-xs text-muted-foreground ml-2">
                  ${shekelToUsd(previewing.shekelCost).toFixed(2)}
                </span>
              </p>
              <div className="flex flex-col gap-2 w-full mt-3">
                <button
                  onClick={async () => {
                    unlockAudio();
                    if (!previewing) return;
                    if (wallet.shekelBalance < previewing.shekelCost) {
                      fxTap(true);
                      setShowAdd(true);
                      return;
                    }
                    pinFront(previewing.id);
                    fxPurchase();
                    setPendingGift(previewing);
                    setPreviewing(null);
                    setTargetPickerOpen(true);
                  }}
                  className="w-full h-11 rounded-full bg-gradient-gold text-primary-foreground font-bold text-sm gold-shadow flex items-center justify-center gap-2"
                >
                  <Send size={16} />
                  {`Purchase and send · ${SHEKEL}${formatShekels(previewing.shekelCost)}`}
                </button>
                <div className="flex gap-2 w-full">
                  <button
                    onClick={() => {
                      fxGiftPreview(previewing!.category);
                      setPreviewing(null);
                      navigate("/feed");
                      toast.info("Pick a post to send this gift");
                    }}
                    className="flex-1 h-11 rounded-full bg-secondary/50 border border-secondary/70 text-foreground font-bold text-sm flex items-center justify-center gap-2"
                  >
                    <Send size={16} /> Send on Feed
                  </button>
                  <button
                    onClick={() => {
                      setPreviewing(null);
                      setShowAdd(true);
                    }}
                    className="flex-1 h-11 rounded-full bg-card border border-border/60 text-foreground font-bold text-sm flex items-center justify-center gap-2"
                  >
                    <ShoppingCart size={16} /> Add Shekels
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <GiftTargetPicker
        open={targetPickerOpen}
        onOpenChange={setTargetPickerOpen}
        onFeed={() => {
          setTargetPickerOpen(false);
          navigate("/feed");
          toast.info("Pick a post to send this gift");
        }}
        onPick={(target) => {
          setGiftTarget(target);
          setTargetPickerOpen(false);
          setConfirming(true);
        }}
      />

      <AlertDialog
        open={confirming && !!pendingGift && !!giftTarget}
        onOpenChange={(o) => {
          if (!o && !sending) {
            setConfirming(false);
            setGiftTarget(null);
            setPendingGift(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-gold">
              Send {pendingGift?.name} to @{giftTarget?.username}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will deduct {SHEKEL}{pendingGift ? formatShekels(pendingGift.shekelCost) : "0"} from your wallet
              and notify @{giftTarget?.username} immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {giftTarget && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-card/60 border border-border/60">
              {pendingGift && (
                <GiftIcon animationType={pendingGift.animationType} tier={pendingGift.category} size="sm" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">@{giftTarget.username}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {giftTarget.caption || "Recent post"}
                </p>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={sending || !pendingGift || !giftTarget}
              onClick={async (e) => {
                e.preventDefault();
                if (!pendingGift || !giftTarget) return;
                const ok = await performSend(pendingGift, giftTarget);
                if (ok) {
                  setConfirming(false);
                  setGiftTarget(null);
                  setPendingGift(null);
                }
              }}
              className="bg-gradient-gold text-primary-foreground"
            >
              {sending ? (
                <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Sending…</span>
              ) : (
                <>Confirm send</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Section({
  icon,
  title,
  gifts,
  onPreview,
}: {
  icon: React.ReactNode;
  title: string;
  gifts: RoyalGift[];
  onPreview: (g: RoyalGift) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-1">
        {icon}
        <h3 className="font-display text-sm tracking-wider uppercase text-foreground">{title}</h3>
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
        {gifts.map((g) => (
          <button
            key={g.id}
            onClick={() => onPreview(g)}
            className="shrink-0 w-28 royal-card p-3 flex flex-col items-center gap-1 hover:border-primary/40 transition-all active:scale-95"
          >
            <GiftIcon animationType={g.animationType} tier={g.category} size="md" />
            <p className="text-[11px] font-semibold text-center line-clamp-1">{g.name}</p>
            <p className="text-[11px] font-bold tabular-nums">
              <span className="text-gold mr-0.5">{SHEKEL}</span>
              {formatShekels(g.shekelCost)}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

function StoreGiftCard({
  gift,
  onPreview,
}: {
  gift: RoyalGift;
  onPreview: (g: RoyalGift) => void;
}) {
  return (
    <button
      onClick={() => onPreview(gift)}
      className="relative royal-card p-3 flex flex-col items-center gap-1.5 hover:border-primary/50 transition-all active:scale-95"
    >
      <GiftIcon animationType={gift.animationType} tier={gift.category} size="md" />
      <p className="text-[11px] font-semibold text-center line-clamp-2 min-h-[28px]">{gift.name}</p>
      <p className="text-[11px] font-bold tabular-nums">
        <span className="text-gold mr-0.5">{SHEKEL}</span>
        {formatShekels(gift.shekelCost)}
      </p>
      {gift.rarity === "legendary" && (
        <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-gradient-gold text-primary-foreground">
          Legendary
        </span>
      )}
      {gift.rarity === "mythic" && (
        <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-gradient-crimson text-destructive-foreground">
          Mythic
        </span>
      )}
    </button>
  );
}
