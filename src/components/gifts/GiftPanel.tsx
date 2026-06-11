import { useEffect, useState } from "react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useIsMobile } from "@/hooks/use-mobile";
import { GiftPanelRecipient, GiftCategory, RoyalGift } from "@/types/gifts";
import { useWallet } from "@/hooks/useWallet";
import { useGiftSend } from "@/hooks/useGiftSend";
import { useGiftCombo } from "@/hooks/useGiftCombo";
import { useGiftFavorites } from "@/hooks/useGiftFavorites";
import GiftPanelHeader from "./GiftPanelHeader";
import GiftWalletBar from "./GiftWalletBar";
import GiftCategoryTabs from "./GiftCategoryTabs";
import GiftGrid from "./GiftGrid";
import GiftMultiplierBar from "./GiftMultiplierBar";
import GiftSendButton, { SendStatus } from "./GiftSendButton";
import GiftComboMeter from "./GiftComboMeter";
import GiftLiveFeed from "./GiftLiveFeed";
import TopGifterCard from "./TopGifterCard";
import AddShekelsModal from "./AddShekelsModal";
import QuickSendRail from "./QuickSendRail";
import GiftRecipientPicker, { type GiftRecipientCandidate } from "./GiftRecipientPicker";
import GiftConfirmDialog from "./GiftConfirmDialog";
import { toast } from "sonner";
import { fxGiftSend, fxPurchase, fxTap, isMuted, setMuted, unlockAudio } from "@/lib/giftFx";
import { Volume2, VolumeX, ArrowLeft } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

interface ExtendedRecipient extends GiftPanelRecipient {
  displayName?: string;
  verified?: boolean;
}

interface GiftPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** When omitted, the panel opens with an in-flow recipient picker. */
  recipient?: ExtendedRecipient;
  postId?: string;
  initialGift?: RoyalGift | null;
  /** Called after a successful send so the parent (e.g. PostCard) can play an anchored animation. */
  onSent?: (gift: RoyalGift, quantity: number) => void;
}

export default function GiftPanel({ isOpen, onClose, recipient: recipientProp, postId, initialGift, onSent }: GiftPanelProps) {
  const { user } = useAuth();
  const [pickedRecipient, setPickedRecipient] = useState<ExtendedRecipient | null>(null);
  const recipient = recipientProp ?? pickedRecipient;
  const needsPicker = !recipient;
  const isSelf = !!user && !!recipient && user.id === recipient.id;

  const [activeCategory, setActiveCategory] = useState<GiftCategory>("popular");
  const [selectedGift, setSelectedGift] = useState<RoyalGift | undefined>();
  const [quantity, setQuantity] = useState<1 | 5 | 10>(1);
  const [showAddShekels, setShowAddShekels] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState<SendStatus>("idle");
  const [sendingGiftId, setSendingGiftId] = useState<string | undefined>();
  const [muted, setMutedState] = useState<boolean>(() => (typeof window === "undefined" ? false : isMuted()));

  const { wallet, refreshWallet, applyDelta } = useWallet();
  const { sendGift } = useGiftSend();
  const { comboCount, registerGiftSend, reset } = useGiftCombo();
  const { pinFront } = useGiftFavorites();

  useEffect(() => {
    if (isOpen) {
      unlockAudio();
      refreshWallet();
      setStatus("idle");
      if (initialGift) setSelectedGift(initialGift);
      trackEvent("gift_flow_opened", { metadata: { has_recipient: !!recipientProp, has_post: !!postId } });
    } else {
      reset();
      setPickedRecipient(null);
      setShowConfirm(false);
    }
  }, [isOpen, refreshWallet, reset, initialGift, recipientProp, postId]);

  const totalCost = (selectedGift?.shekelCost ?? 0) * quantity;
  const insufficient = !!selectedGift && totalCost > wallet.shekelBalance;
  const isSending = status === "sending";

  const toggleMuted = () => {
    const v = !muted;
    setMuted(v);
    setMutedState(v);
    if (!v) fxTap();
  };

  const handleRecipientPick = (r: GiftRecipientCandidate) => {
    setPickedRecipient({
      id: r.id,
      username: r.username,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl ?? undefined,
      verified: r.verified,
    });
    trackEvent("gift_recipient_selected", { metadata: { source: r.source } });
  };

  const handleSendIntent = () => {
    if (!selectedGift || isSending || !recipient) return;
    if (insufficient) {
      fxTap(true);
      trackEvent("gift_insufficient_balance", { metadata: { gift_id: selectedGift.id, total: totalCost, balance: wallet.shekelBalance } });
      setShowAddShekels(true);
      trackEvent("shekels_purchase_started");
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirmedSend = async () => {
    if (!selectedGift || isSending || !recipient) return;
    setStatus("sending");
    setSendingGiftId(selectedGift.id);
    fxTap(true);
    trackEvent("gift_send_started", { metadata: { gift_id: selectedGift.id, quantity, total: totalCost } });
    // Optimistic wallet deduct
    applyDelta(-totalCost, totalCost);
    try {
      await sendGift({ gift: selectedGift, recipientId: recipient.id, postId, quantity });
      registerGiftSend();
      pinFront(selectedGift.id);
      fxGiftSend(selectedGift.category);
      setStatus("sent");
      setShowConfirm(false);
      onSent?.(selectedGift, quantity);
      refreshWallet();
      trackEvent("gift_sent", { metadata: { gift_id: selectedGift.id, quantity, total: totalCost } });
      toast.success(`Sent ${quantity}x ${selectedGift.name} to @${recipient.username}`);
      setTimeout(() => {
        setStatus("idle");
        setSendingGiftId(undefined);
      }, 1200);
    } catch (e) {
      applyDelta(totalCost, -totalCost);
      const msg = e instanceof Error ? e.message : "Failed to send gift";
      toast.error(msg);
      trackEvent("gift_send_failed", { metadata: { gift_id: selectedGift.id, reason: msg.slice(0, 60) } });
      setStatus("failed");
      setShowConfirm(false);
      setTimeout(() => {
        setStatus("idle");
        setSendingGiftId(undefined);
      }, 1800);
    }
  };

  const isMobile = useIsMobile();

  const Body = needsPicker ? (
    <GiftRecipientPicker onPick={handleRecipientPick} onCancel={onClose} />
  ) : isSelf ? (
    <div className="p-8 text-center space-y-2">
      <p className="font-display text-lg text-gold">You can't gift yourself</p>
      <p className="text-xs text-muted-foreground">
        Gifts can only be sent to other creators. Find a post you love on the feed and send one there.
      </p>
    </div>
  ) : (
    <div className="relative">
      <button
        type="button"
        onClick={toggleMuted}
        aria-label={muted ? "Unmute royal sounds" : "Mute royal sounds"}
        className="absolute top-3 right-3 z-20 size-9 rounded-full bg-background/60 hover:bg-background/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
      {/* Allow changing recipient when the picker was used */}
      {!recipientProp && pickedRecipient && (
        <button
          type="button"
          onClick={() => setPickedRecipient(null)}
          className="absolute top-3 left-3 z-20 h-9 px-3 rounded-full bg-background/60 hover:bg-background/80 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={13} /> Change
        </button>
      )}
      <GiftComboMeter count={comboCount} />
      <GiftPanelHeader username={recipient!.username} avatarUrl={recipient!.avatarUrl} />
      <GiftWalletBar balance={wallet.shekelBalance} onAdd={() => { setShowAddShekels(true); trackEvent("shekels_purchase_started"); }} />
      <TopGifterCard recipientId={recipient!.id} />
      <QuickSendRail onPick={setSelectedGift} selectedId={selectedGift?.id} />
      <GiftLiveFeed postId={postId} />
      <GiftCategoryTabs active={activeCategory} onChange={setActiveCategory} disabled={isSending} />
      <GiftGrid
        category={activeCategory}
        selectedId={selectedGift?.id}
        onSelect={setSelectedGift}
        sendingGiftId={sendingGiftId}
        disabled={isSending}
      />
      <GiftMultiplierBar quantity={quantity} onChange={setQuantity} disabled={isSending} />
      <GiftSendButton
        gift={selectedGift}
        quantity={quantity}
        status={status}
        insufficient={insufficient}
        onSend={handleSendIntent}
      />
    </div>
  );

  return (
    <>
      {isMobile ? (
        <Drawer open={isOpen} onOpenChange={(v) => !v && onClose()}>
          <DrawerContent className="bg-gradient-card border-t border-border/60 max-h-[92vh]">
            {Body}
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
          <DialogContent className="bg-gradient-card border border-border/60 max-w-[520px] p-0 overflow-hidden rounded-2xl">
            <VisuallyHidden>
              <DialogTitle>Send a gift</DialogTitle>
              <DialogDescription>Choose a royal gift to send.</DialogDescription>
            </VisuallyHidden>
            <div className="max-h-[88vh] overflow-y-auto scrollbar-none">{Body}</div>
          </DialogContent>
        </Dialog>
      )}

      <AddShekelsModal
        open={showAddShekels}
        onOpenChange={(o) => {
          setShowAddShekels(o);
          if (!o) {
            refreshWallet();
            fxPurchase();
          }
        }}
      />

      <GiftConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        gift={selectedGift ?? null}
        quantity={quantity}
        recipient={recipient ?? null}
        balance={wallet.shekelBalance}
        sending={isSending}
        onConfirm={handleConfirmedSend}
      />
    </>
  );
}
