import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Instagram, Twitter, Facebook, Loader2, AlertCircle } from "lucide-react";
import BrandLogo from "./BrandLogo";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORY_LABEL, locationLabel } from "@/lib/crown";
import { FeedPost } from "./PostCard";
import { trackEvent } from "@/lib/analytics";
import { trackUsage, trackUsageEvent } from "@/lib/usageTrack";
import { resolvePostShareImage, usePostShareData } from "@/lib/postShare";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useFeedFilters } from "@/hooks/useFeedFilters";

interface ShareProps {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  post: FeedPost;
}

export function ShareDialog({ open, onOpenChange, post: initialPost }: ShareProps) {
  // Always render against the freshest server copy so edits to the image,
  // caption, category, or username appear immediately in the share card.
  // The hook NEVER sets `deleted` for transient errors — only when the DB
  // confirms the row is missing or is_removed = true.
  const { post, loading: loadingFresh, deleted, refreshError } = usePostShareData(initialPost, open);
  const { user } = useAuth();
  const { sensitiveMode } = useFeedFilters();

  const url = `${window.location.origin}/p/${post.id}`;
  const text = `Competing for King/Queen of ${post.city || "Global"} on CrownMe — ${CATEGORY_LABEL[post.category]}`;
  // Share cards never expose sensitive media when the viewer's own preference
  // says blur/hide, when eligibility isn't confirmed, and never for
  // removed/banned posts. Author always sees their own.
  const previewImg = resolvePostShareImage(post, {
    userId: user?.id ?? null,
    mode: sensitiveMode,
    ageConfirmed: !!user, // 18+ confirmation is required at signup on CrownMe
  });

  useEffect(() => {
    if (!open) return;
    trackUsage("share_dialog_opened", post.id);
    if (previewImg && !deleted) trackUsage("share_card_previewed", post.id);
  }, [open, post.id, previewImg, deleted]);

  const incrementShare = async (channel: string) => {
    await supabase.from("posts").update({ share_count: (post.share_count || 0) + 1 }).eq("id", post.id);
    trackEvent("post_shared", { postId: post.id, category: post.category, metadata: { channel } });
    // Treat any outbound share as a "download" of the share card for cost
    // attribution (card image is fetched/rendered when the user shares).
    trackUsageEvent("share_card_downloaded", { postId: post.id, metadata: { channel } });
  };

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
    incrementShare("copy_link");
  };

  const open_url = (u: string, channel = "external") => {
    window.open(u, "_blank");
    incrementShare(channel);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-sm sm:max-w-md bg-card border-border max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-gold">Share to your kingdom</DialogTitle>
        </DialogHeader>

        {deleted ? (
          <div className="rounded-2xl bg-muted/30 border border-border p-6 text-center my-2">
            <p className="text-sm font-semibold">Post no longer available</p>
            <p className="text-xs text-muted-foreground mt-1">This post has been removed and can't be shared.</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden bg-gradient-royal border border-primary/40 px-3 sm:px-5 pt-4 sm:pt-5 pb-4 my-2 relative">
            <div className="flex flex-col items-center text-center mb-3 sm:mb-4 px-1">
              <BrandLogo size={72} priority className="sm:!w-[88px] sm:!h-[88px] drop-shadow-[0_4px_18px_hsl(43_95%_60%/0.35)]" />
              <p className="mt-2 text-[10px] leading-tight sm:text-xs sm:leading-snug text-muted-foreground/90 italic whitespace-nowrap">
                Where every photo competes for a crown.
              </p>
            </div>

            <div className="aspect-square rounded-xl overflow-hidden mb-3 ring-1 ring-primary/20 relative bg-muted/20">
              {previewImg && (
                <img key={previewImg} loading="lazy" src={previewImg} alt="" crossOrigin="anonymous" className="w-full h-full object-cover" />
              )}
              {loadingFresh && (
                <div className="absolute top-2 right-2 bg-black/40 backdrop-blur rounded-full p-1.5">
                  <Loader2 size={12} className="animate-spin text-white" />
                </div>
              )}
            </div>
            <p className="text-sm font-bold mb-1 truncate">@{post.profile.username}</p>
            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
              Competing for {CATEGORY_LABEL[post.category]} in {locationLabel(post)}
            </p>
            <p className="font-display text-xs text-primary tracking-wide">Earn the crown. Defend the throne.</p>
            {refreshError && (
              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <AlertCircle size={11} />
                <span>Unable to refresh post right now — showing last known version.</span>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-4 gap-2">
          <Button variant="outline" size="sm" disabled={deleted} onClick={() => open_url(`https://www.instagram.com/`)} className="flex-col h-16">
            <Instagram size={20} /><span className="text-[10px]">Instagram</span>
          </Button>
          <Button variant="outline" size="sm" disabled={deleted} onClick={() => open_url(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`)} className="flex-col h-16">
            <Twitter size={20} /><span className="text-[10px]">X</span>
          </Button>
          <Button variant="outline" size="sm" disabled={deleted} onClick={() => open_url(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`)} className="flex-col h-16">
            <Facebook size={20} /><span className="text-[10px]">Facebook</span>
          </Button>
          <Button variant="outline" size="sm" disabled={deleted} onClick={copy} className="flex-col h-16">
            <Copy size={20} /><span className="text-[10px]">Copy</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
