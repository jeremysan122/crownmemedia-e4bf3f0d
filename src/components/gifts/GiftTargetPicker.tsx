import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Bookmark, Crown, Eye, Film, Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { fetchRecentGiftTargets, type RecentGiftTarget, type RecentGiftTargetSource } from "@/lib/recentGiftTargets";

const SOURCE_LABEL: Record<RecentGiftTargetSource, string> = {
  saved: "Saved",
  liked: "Liked",
  viewed: "Viewed",
};

const SOURCE_ICON: Record<RecentGiftTargetSource, typeof Bookmark> = {
  saved: Bookmark,
  liked: Crown,
  viewed: Eye,
};

export default function GiftTargetPicker({
  open,
  onOpenChange,
  onPick,
  onFeed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (target: RecentGiftTarget) => void;
  onFeed: () => void;
}) {
  const { user } = useAuth();
  const [targets, setTargets] = useState<RecentGiftTarget[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetchRecentGiftTargets(user?.id)
      .then((rows) => { if (!cancelled) setTargets(rows); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, user?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-gradient-card border-border/70 p-0 overflow-hidden rounded-2xl">
        <VisuallyHidden>
          <DialogTitle>Choose where to send this gift</DialogTitle>
          <DialogDescription>Select a recent post or scroll to send the purchased gift.</DialogDescription>
        </VisuallyHidden>
        <div className="p-4 border-b border-border/60">
          <p className="font-display text-lg text-gold">Send to a recent post</p>
          <p className="text-xs text-muted-foreground mt-1">Pick from posts and scrolls you recently liked, saved, or viewed.</p>
        </div>

        <div className="max-h-[62vh] overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="py-12 flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin mr-2" /> Loading recent posts…
            </div>
          ) : targets.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <Crown size={34} className="mx-auto text-primary opacity-70" fill="currentColor" />
              <div>
                <p className="font-semibold text-foreground">No recent posts yet</p>
                <p className="text-xs text-muted-foreground mt-1">Open the feed or scrolls, then choose a creator to gift.</p>
              </div>
              <button type="button" onClick={onFeed} className="h-10 px-4 rounded-full bg-gradient-gold text-primary-foreground font-bold text-sm">
                Open Feed
              </button>
            </div>
          ) : (
            targets.map((target) => {
              const SourceIcon = SOURCE_ICON[target.source];
              return (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => onPick(target)}
                  className="w-full flex items-center gap-3 p-2 rounded-xl bg-card/70 border border-border/60 hover:border-primary/50 text-left transition active:scale-[0.99]"
                >
                  <div className="relative size-16 rounded-lg overflow-hidden bg-muted shrink-0">
                    {target.isSensitive ? (
                      <div className="absolute inset-0 bg-muted flex items-center justify-center text-muted-foreground">
                        <ShieldAlert size={18} />
                      </div>
                    ) : (
                      <img src={target.videoPosterUrl || target.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                    )}
                    {target.mediaType === "video" && (
                      <span className="absolute top-1 right-1 size-5 rounded-full bg-background/75 flex items-center justify-center text-foreground">
                        <Film size={11} />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="font-semibold text-sm truncate">@{target.username}</p>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold shrink-0">
                        <SourceIcon size={10} fill={target.source === "saved" ? "currentColor" : "none"} /> {SOURCE_LABEL[target.source]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {target.isSensitive ? target.sensitiveReason || "Sensitive content" : target.caption || "Untitled post"}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}