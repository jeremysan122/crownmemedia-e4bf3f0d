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
import { toast } from "sonner";
import { fxGiftSend, fxPurchase, fxTap, isMuted, setMuted, unlockAudio } from "@/lib/giftFx";
import { Volume2, VolumeX } from "lucide-react";

interface GiftPanelProps {
  isOpen: boolean;
  onClose: () => void;
  recipient: GiftPanelRecipient;
  postId?: string;
  /** Called after a successful send so the parent (e.g. PostCard) can play an anchored animation. */
  onSent?: (gift: RoyalGift, quantity: number) => void;
}

export default function GiftPanel({ isOpen, onClose, recipient, postId, onSent }: GiftPanelProps) {
  const { user } = useAuth();
  const isSelf = !!user && user.id === recipient.id;
  const [activeCategory, setActiveCategory] = useState<GiftCategory>("popular");
  const [selectedGift, setSelectedGift] = useState<RoyalGift | undefined>();
  const [quantity, setQuantity] = useState<1 | 5 | 10>(1);
  const [showAddShekels, setShowAddShekels] = useState(false);
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
    } else {
      reset();
    }
  }, [isOpen, refreshWallet, reset]);

  const totalCost = (selectedGift?.shekelCost ?? 0) * quantity;
  const insufficient = !!selectedGift && totalCost > wallet.shekelBalance;
  const isSending = status === "sending";

  const toggleMuted = () => {
    const v = !muted;
    setMuted(v);
    setMutedState(v);
    if (!v) fxTap();
  };

  const handleSend = async () => {
    if (!selectedGift || isSending) return;
    if (insufficient) {
      fxTap(true);
      setShowAddShekels(true);
      return;
    }
    setStatus("sending");
    setSendingGiftId(selectedGift.id);
    fxTap(true);
    // Optimistic wallet deduct
    applyDelta(-totalCost, totalCost);
    try {
      await sendGift({ gift: selectedGift, recipientId: recipient.id, postId, quantity });
      registerGiftSend();
      pinFront(selectedGift.id); // auto-pin most recently used so re-send is one tap
      fxGiftSend(selectedGift.category);
      setStatus("sent");
      onSent?.(selectedGift, quantity);
      // Confirm with server truth
      refreshWallet();
      // Reset to idle shortly so user can send another
      setTimeout(() => {
        setStatus("idle");
        setSendingGiftId(undefined);
      }, 1200);
    } catch (e) {
      // Roll back optimistic deduction
      applyDelta(totalCost, -totalCost);
      const msg = e instanceof Error ? e.message : "Failed to send gift";
      toast.error(msg);
      setStatus("failed");
      setTimeout(() => {
        setStatus("idle");
        setSendingGiftId(undefined);
      }, 1800);
    }
  };

  const isMobile = useIsMobile();

  const Body = isSelf ? (
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
      <GiftComboMeter count={comboCount} />
      <GiftPanelHeader username={recipient.username} avatarUrl={recipient.avatarUrl} />
      <GiftWalletBar balance={wallet.shekelBalance} onAdd={() => setShowAddShekels(true)} />
      <TopGifterCard recipientId={recipient.id} />
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
        onSend={handleSend}
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
    </>
  );
}
