import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Instagram, Twitter, Facebook, Loader2, AlertCircle, RefreshCw, MessageCircle } from "lucide-react";
import DmSharePicker, { type DmShareRecipient } from "@/components/messages/DmSharePicker";
import { sendDmShare } from "@/lib/dmShare";
import BrandLogo from "./BrandLogo";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORY_LABEL, locationLabel } from "@/lib/crown";
import { FeedPost } from "./PostCard";
import { trackEvent } from "@/lib/analytics";
import { trackUsage, trackUsageEvent } from "@/lib/usageTrack";
import { resolvePostShareImage, usePostShareData } from "@/lib/postShare";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useFeedFilters } from "@/hooks/useFeedFilters";

interface ShareProps {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  post: FeedPost;
  /** Optional surface label for analytics (e.g. "feed", "post_page"). */
  source?: string;
}

type Channel = "instagram" | "x" | "facebook" | "copy_link" | "dm";

export function ShareDialog({ open, onOpenChange, post: initialPost, source }: ShareProps) {
  const { user } = useAuth();
  const { sensitiveMode } = useFeedFilters();
  const [retrying, setRetrying] = useState(false);
  const [dmPickerOpen, setDmPickerOpen] = useState(false);
  const [sendingDm, setSendingDm] = useState(false);
  // Preserve the user's last-selected channel across refresh/retry — only
  // reset when the underlying post changes.
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const lastPostIdRef = useRef(initialPost.id);

  // Analytics callback — fires once per status resolution. We use a ref so
  // identity changes don't re-trigger the hook's auto-load effect.
  const analyticsCtx = useRef({ source, postId: initialPost.id });
  analyticsCtx.current = { source, postId: initialPost.id };

  const onStatusResolved = useCallback(
    (info: { status: string; fromCache: boolean; error: boolean }) => {
      const { postId, source: src } = analyticsCtx.current;
      const meta = {
        post_id: postId,
        from_cache: info.fromCache,
        source: src ?? "unknown",
        signed_in: !!user,
      };
      if (info.error) {
        trackEvent("share_status_refresh_error", { postId, metadata: meta });
        return;
      }
      trackEvent(info.fromCache ? "share_status_cache_hit" : "share_status_cache_miss", {
        postId,
        metadata: { ...meta, status: info.status },
      });
      trackEvent("share_status_refresh_success", {
        postId,
        metadata: { ...meta, status: info.status },
      });
    },
    [user],
  );

  const { post, loading: loadingFresh, deleted, hidden, refreshError, cacheHit, refresh } =
    usePostShareData(initialPost, open, { viewerId: user?.id ?? null, onStatusResolved });

  // Reset channel when the post itself changes (different dialog instance).
  useEffect(() => {
    if (lastPostIdRef.current !== initialPost.id) {
      lastPostIdRef.current = initialPost.id;
      setSelectedChannel(null);
    }
  }, [initialPost.id]);

  const url = `${window.location.origin}/p/${post.id}`;
  const text = `Competing for King/Queen of ${post.city || "Global"} on CrownMe — ${CATEGORY_LABEL[post.category]}`;
  const previewImg = resolvePostShareImage(post, {
    userId: user?.id ?? null,
    mode: sensitiveMode,
    ageConfirmed: !!user,
  });

  const shareable = !deleted && !hidden && !refreshError;
  const blockReason: "deleted" | "hidden" | "unavailable" | null = deleted
    ? "deleted"
    : hidden
      ? "hidden"
      : refreshError
        ? "unavailable"
        : null;

  // Open analytics — once per (post, open).
  useEffect(() => {
    if (!open) return;
    trackUsage("share_dialog_opened", post.id);
    trackEvent("share_dialog_opened", {
      postId: post.id,
      metadata: { source: source ?? "unknown", signed_in: !!user },
    });
    if (previewImg && shareable) trackUsage("share_card_previewed", post.id);
  }, [open, post.id, previewImg, shareable, source, user]);

  const onRetry = useCallback(async () => {
    if (retrying) return;
    setRetrying(true);
    trackEvent("share_status_refresh_started", {
      postId: post.id,
      metadata: { source: source ?? "unknown", trigger: "manual_retry" },
    });
    try {
      await refresh();
    } finally {
      setRetrying(false);
    }
  }, [retrying, refresh, post.id, source]);

  const recordAttempt = (channel: Channel) => {
    setSelectedChannel(channel);
    trackEvent("share_channel_selected", {
      postId: post.id,
      metadata: { channel, source: source ?? "unknown", cache_hit: cacheHit },
    });
    trackEvent("share_attempted", {
      postId: post.id,
      metadata: { channel, source: source ?? "unknown", cache_hit: cacheHit },
    });
  };

  const recordBlock = (channel: Channel) => {
    if (!blockReason) return;
    const event =
      blockReason === "deleted"
        ? "share_blocked_deleted"
        : blockReason === "hidden"
          ? "share_blocked_hidden"
          : "share_blocked_unavailable";
    trackEvent(event, {
      postId: post.id,
      metadata: { channel, source: source ?? "unknown" },
    });
  };

  const incrementShare = async (channel: Channel) => {
    await supabase
      .from("posts")
      .update({ share_count: (post.share_count || 0) + 1 })
      .eq("id", post.id);
    trackEvent("post_shared", { postId: post.id, category: post.category, metadata: { channel } });
    trackEvent("share_success", {
      postId: post.id,
      metadata: { channel, source: source ?? "unknown" },
    });
    trackUsageEvent("share_card_downloaded", { postId: post.id, metadata: { channel } });
  };

  const guardedShare = async (channel: Channel, action: () => void | Promise<void>) => {
    recordAttempt(channel);
    if (!shareable) {
      recordBlock(channel);
      toast.error(
        blockReason === "deleted"
          ? "This post is no longer available."
          : blockReason === "hidden"
            ? "You can't share a post you can't view."
            : "Couldn't verify this post — try again.",
      );
      return;
    }
    await action();
    await incrementShare(channel);
  };

  const copy = () =>
    guardedShare("copy_link", async () => {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    });

  const open_url = (u: string, channel: Channel) =>
    guardedShare(channel, () => {
      window.open(u, "_blank");
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="share-dialog" className="w-[calc(100vw-2rem)] max-w-sm sm:max-w-md bg-card border-border max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-gold">Share to your kingdom</DialogTitle>
        </DialogHeader>

        {deleted ? (
          <div data-testid="share-card-unavailable" className="rounded-2xl bg-muted/30 border border-border p-6 text-center my-2">
            <p className="text-sm font-semibold">Post no longer available</p>
            <p className="text-xs text-muted-foreground mt-1">This post has been removed and can't be shared.</p>
          </div>
        ) : hidden ? (
          <div data-testid="share-card-hidden" className="rounded-2xl bg-muted/30 border border-border p-6 text-center my-2">
            <p className="text-sm font-semibold">You can't view this post</p>
            <p className="text-xs text-muted-foreground mt-1">It exists but is private or restricted for your account.</p>
          </div>
        ) : refreshError ? (
          <div data-testid="share-card-error" className="rounded-2xl bg-muted/30 border border-destructive/30 p-6 text-center my-2">
            <AlertCircle className="mx-auto mb-2 text-destructive" size={22} />
            <p className="text-sm font-semibold">Couldn't verify this post</p>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              We couldn't refresh the share card. Try again before sharing.
            </p>
            <Button
              data-testid="share-card-retry"
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetry}
              disabled={retrying}
              className="gap-2"
            >
              {retrying ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Retrying…
                </>
              ) : (
                <>
                  <RefreshCw size={14} /> Try again
                </>
              )}
            </Button>
          </div>
        ) : (
          <div data-testid="share-card" className="rounded-2xl overflow-hidden bg-gradient-royal border border-primary/40 px-3 sm:px-5 pt-4 sm:pt-5 pb-4 my-2 relative">
            <div className="flex flex-col items-center text-center mb-3 sm:mb-4 px-1">
              <BrandLogo size={72} priority className="sm:!w-[88px] sm:!h-[88px] drop-shadow-[0_4px_18px_hsl(43_95%_60%/0.35)]" />
              <p className="mt-2 text-[10px] leading-tight sm:text-xs sm:leading-snug text-muted-foreground/90 italic whitespace-nowrap">
                Where every photo competes for a crown.
              </p>
            </div>

            <div className="aspect-square rounded-xl overflow-hidden mb-3 ring-1 ring-primary/20 relative bg-muted/20">
              {previewImg && (
                <PostMedia
                  key={previewImg}
                  src={previewImg}
                  alt=""
                  mediaType="image"
                  filter={(post.filter ?? null) as FilterId | null}
                  className="w-full h-full object-cover"
                />
              )}
              {/* Hidden mirror img so existing testids / SEO crawlers still see the resolved URL. */}
              {previewImg && (
                <img
                  data-testid="share-card-image"
                  src={previewImg}
                  alt=""
                  aria-hidden
                  className="sr-only"
                />
              )}
              {loadingFresh && (
                <div className="absolute top-2 right-2 bg-black/40 backdrop-blur rounded-full p-1.5">
                  <Loader2 size={12} className="animate-spin text-white" />
                </div>
              )}
            </div>
            <p data-testid="share-card-username" className="text-sm font-bold mb-1 truncate">@{post.profile.username}</p>
            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
              Competing for {CATEGORY_LABEL[post.category]} in {locationLabel(post)}
            </p>
            <p className="font-display text-xs text-primary tracking-wide">Earn the crown. Defend the throne.</p>
          </div>
        )}

        <div className="grid grid-cols-5 gap-2">
          <Button data-testid="share-dm" data-selected={selectedChannel === "dm"} variant="outline" size="sm" disabled={!shareable || !user || sendingDm} onClick={() => { if (!shareable) { recordBlock("dm"); return; } recordAttempt("dm"); setDmPickerOpen(true); }} className="flex-col h-16">
            {sendingDm ? <Loader2 size={20} className="animate-spin" /> : <MessageCircle size={20} />}
            <span className="text-[10px]">DM</span>
          </Button>
          <Button data-testid="share-instagram" data-selected={selectedChannel === "instagram"} variant="outline" size="sm" disabled={!shareable} onClick={() => open_url(`https://www.instagram.com/`, "instagram")} className="flex-col h-16">
            <Instagram size={20} /><span className="text-[10px]">Instagram</span>
          </Button>
          <Button data-testid="share-twitter" data-selected={selectedChannel === "x"} variant="outline" size="sm" disabled={!shareable} onClick={() => open_url(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "x")} className="flex-col h-16">
            <Twitter size={20} /><span className="text-[10px]">X</span>
          </Button>
          <Button data-testid="share-facebook" data-selected={selectedChannel === "facebook"} variant="outline" size="sm" disabled={!shareable} onClick={() => open_url(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, "facebook")} className="flex-col h-16">
            <Facebook size={20} /><span className="text-[10px]">Facebook</span>
          </Button>
          <Button data-testid="share-copy" data-selected={selectedChannel === "copy_link"} variant="outline" size="sm" disabled={!shareable} onClick={copy} className="flex-col h-16">
            <Copy size={20} /><span className="text-[10px]">Copy</span>
          </Button>
        </div>

        <DmSharePicker
          open={dmPickerOpen}
          onOpenChange={setDmPickerOpen}
          title="Share post via DM"
          subtitle={`@${post.profile.username} · ${CATEGORY_LABEL[post.category]}`}
          onPick={async (r: DmShareRecipient) => {
            setDmPickerOpen(false);
            if (!shareable) { toast.error("Post unavailable"); return; }
            setSendingDm(true);
            try {
              const res = await sendDmShare({ recipientId: r.userId, kind: "post_share", postId: post.id });
              await incrementShare("dm");
              toast.success(res.deduped ? `Already sent to @${r.username}` : `Sent to @${r.username}`);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Couldn't send";
              toast.error(msg);
            } finally {
              setSendingDm(false);
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
