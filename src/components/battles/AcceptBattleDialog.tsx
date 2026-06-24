import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Loader2, Check, X } from "lucide-react";
import { CrownCategory } from "@/lib/crown";
import { cssFor, isValidFilter, type FilterId } from "@/lib/filters";
import { RoyalThumbSkeleton } from "@/components/royal/RoyalSkeleton";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  battle: {
    id: string;
    challenger_post: { image_url: string; category: CrownCategory; filter?: string | null } | null;
    challenger: { username: string; profile_photo_url: string | null } | null;
  } | null;
  onResolved?: () => void;
}

interface PostThumb { id: string; image_url: string; category: CrownCategory; filter: string | null; }

export default function AcceptBattleDialog({ open, onOpenChange, battle, onResolved }: Props) {
  const { user } = useAuth();
  const [posts, setPosts] = useState<PostThumb[]>([]);
  const [postId, setPostId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setPostId("");
    const cat = battle?.challenger_post?.category;
    let q = supabase.from("posts").select("id, image_url, category, filter")
      .eq("user_id", user.id).eq("is_removed", false)
      .order("created_at", { ascending: false }).limit(24);
    if (cat) q = q.eq("category", cat);
    q.then(({ data }) => {
      const ps = (data as PostThumb[]) || [];
      setPosts(ps);
      if (ps[0]) setPostId(ps[0].id);
    });
  }, [open, user, battle]);

  const accept = async () => {
    if (!battle || !postId) return;
    setBusy(true);
    const { error } = await supabase.from("battles")
      .update({ opponent_post_id: postId, status: "active" as any })
      .eq("id", battle.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Challenge accepted — let the duel begin");
    onOpenChange(false);
    onResolved?.();
  };

  const decline = async () => {
    if (!battle) return;
    setBusy(true);
    const { error } = await supabase.from("battles")
      .update({ status: "declined" as any })
      .eq("id", battle.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.info("Challenge declined");
    onOpenChange(false);
    onResolved?.();
  };

  if (!battle) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md bg-card border-border max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-gold">Accept the challenge?</DialogTitle>
          <DialogDescription className="text-xs">
            @{battle.challenger?.username} dares you. Pick the post you'll fight with.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <div className="flex-1 aspect-square rounded-lg overflow-hidden bg-muted">
            {battle.challenger_post?.image_url && (
              <img
                loading="lazy"
                src={battle.challenger_post.image_url}
                alt=""
                className="w-full h-full object-cover"
                style={{ filter: cssFor(isValidFilter(battle.challenger_post.filter ?? null) ? (battle.challenger_post.filter as FilterId) : null) }}
              />
            )}
          </div>
          <div className="font-display text-xl text-gold">VS</div>
          <div className="flex-1 aspect-square rounded-lg overflow-hidden bg-muted border border-dashed border-primary/40 flex items-center justify-center">
            {postId ? (() => {
              const sel = posts.find((p) => p.id === postId);
              return (
                <img
                  loading="lazy"
                  src={sel?.image_url}
                  alt=""
                  className="w-full h-full object-cover"
                  style={{ filter: cssFor(isValidFilter(sel?.filter ?? null) ? (sel!.filter as FilterId) : null) }}
                />
              );
            })() : (
              <span className="text-[10px] text-muted-foreground px-2 text-center">Pick below</span>
            )}
          </div>
        </div>

        {posts.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            You have no posts in this category. Upload one to accept.
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
            {posts.map((p) => (
              <button type="button" key={p.id} onClick={() => setPostId(p.id)}
                className={`relative aspect-square rounded-md overflow-hidden border-2 ${
                  postId === p.id ? "border-primary gold-shadow" : "border-transparent opacity-70"
                }`}>
                <img
                  loading="lazy"
                  src={p.image_url}
                  alt=""
                  className="w-full h-full object-cover"
                  style={{ filter: cssFor(isValidFilter(p.filter ?? null) ? (p.filter as FilterId) : null) }}
                />
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button variant="outline" onClick={decline} disabled={busy}>
            <X size={14} /> Decline
          </Button>
          <Button onClick={accept} disabled={!postId || busy}
            className="bg-gradient-gold text-primary-foreground font-bold gold-shadow">
            {busy ? <Loader2 className="animate-spin" /> : <><Check size={14} /> Accept duel</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
