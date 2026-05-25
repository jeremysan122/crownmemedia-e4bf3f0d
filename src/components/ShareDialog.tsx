import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Instagram, Twitter, Facebook } from "lucide-react";
import BrandLogo from "./BrandLogo";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORY_LABEL, locationLabel } from "@/lib/crown";
import { FeedPost } from "./PostCard";
import { trackEvent } from "@/lib/analytics";

interface ShareProps {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  post: FeedPost;
}

export function ShareDialog({ open, onOpenChange, post }: ShareProps) {
  const url = `${window.location.origin}/p/${post.id}`;
  const text = `Competing for King/Queen of ${post.city || "Global"} on CrownMe — ${CATEGORY_LABEL[post.category]}`;

  const incrementShare = async (channel: string) => {
    await supabase.from("posts").update({ share_count: (post.share_count || 0) + 1 }).eq("id", post.id);
    trackEvent("post_shared", { postId: post.id, category: post.category, metadata: { channel } });
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

        {/* Branded share card preview */}
        <div className="rounded-2xl overflow-hidden bg-gradient-royal border border-primary/40 px-3 sm:px-5 pt-4 sm:pt-5 pb-4 my-2 relative">
          {/* Logo lockup — centered, premium */}
          <div className="flex flex-col items-center text-center mb-3 sm:mb-4 px-1">
            <BrandLogo size={72} priority className="sm:!w-[88px] sm:!h-[88px] drop-shadow-[0_4px_18px_hsl(43_95%_60%/0.35)]" />
            <p className="mt-2 text-[10px] leading-tight sm:text-xs sm:leading-snug text-muted-foreground/90 italic whitespace-nowrap">
              Where every photo competes for a crown.
            </p>
          </div>

          <div className="aspect-square rounded-xl overflow-hidden mb-3 ring-1 ring-primary/20">
            <img loading="lazy" src={post.image_url} alt="" className="w-full h-full object-cover" />
          </div>
          <p className="text-sm font-bold mb-1 truncate">@{post.profile.username}</p>
          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
            Competing for {CATEGORY_LABEL[post.category]} in {locationLabel(post)}
          </p>
          <p className="font-display text-xs text-primary tracking-wide">Earn the crown. Defend the throne.</p>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <Button variant="outline" size="sm" onClick={() => open_url(`https://www.instagram.com/`)} className="flex-col h-16">
            <Instagram size={20} /><span className="text-[10px]">Instagram</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => open_url(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`)} className="flex-col h-16">
            <Twitter size={20} /><span className="text-[10px]">X</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => open_url(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`)} className="flex-col h-16">
            <Facebook size={20} /><span className="text-[10px]">Facebook</span>
          </Button>
          <Button variant="outline" size="sm" onClick={copy} className="flex-col h-16">
            <Copy size={20} /><span className="text-[10px]">Copy</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
