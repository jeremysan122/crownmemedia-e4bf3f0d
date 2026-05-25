import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Crown } from "lucide-react";
import { toast } from "sonner";

type Mode = "followers" | "following";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  userId: string;
  mode: Mode;
}

interface Row {
  id: string;
  username: string;
  profile_photo_url: string | null;
  crowns_held: number;
}

export default function UserListDialog({ open, onOpenChange, userId, mode }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      const col = mode === "followers" ? "follower_id" : "following_id";
      const filterCol = mode === "followers" ? "following_id" : "follower_id";
      const { data: f } = await supabase.from("follows").select(`${col}`).eq(filterCol, userId).limit(500);
      const ids = (f || []).map((r: any) => r[col]).filter(Boolean) as string[];
      if (!ids.length) {
        setRows([]);
        setFollowingSet(new Set());
        setLoading(false);
        return;
      }
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, profile_photo_url, crowns_held")
        .in("id", ids);
      setRows((profs as Row[]) || []);

      // Which of these am I already following?
      if (user) {
        const { data: mine } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", user.id)
          .in("following_id", ids);
        setFollowingSet(new Set(((mine as any) || []).map((r: any) => r.following_id)));
      }
      setLoading(false);
    };
    load();
  }, [open, userId, mode, user]);

  const toggle = async (targetId: string) => {
    if (!user) {
      toast.error("Sign in to follow");
      return;
    }
    if (targetId === user.id) return;
    if (pending.has(targetId)) return;
    setPending((p) => new Set(p).add(targetId));
    const isFollowing = followingSet.has(targetId);
    // optimistic
    setFollowingSet((s) => {
      const next = new Set(s);
      if (isFollowing) next.delete(targetId); else next.add(targetId);
      return next;
    });
    try {
      if (isFollowing) {
        const { error } = await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", targetId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("follows").insert({ follower_id: user.id, following_id: targetId });
        if (error) throw error;
      }
    } catch (err: any) {
      // rollback
      setFollowingSet((s) => {
        const next = new Set(s);
        if (isFollowing) next.add(targetId); else next.delete(targetId);
        return next;
      });
      toast.error(err.message || "Action failed");
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(targetId);
        return next;
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-sm sm:max-w-md bg-card border-border max-h-[80dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-gold capitalize">{mode}</DialogTitle>
        </DialogHeader>
        {loading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
        {!loading && rows.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No {mode} yet</p>
        )}
        <div className="space-y-1">
          {rows.map((r) => {
            const isMe = user?.id === r.id;
            const isFollowing = followingSet.has(r.id);
            const isPending = pending.has(r.id);
            return (
              <div
                key={r.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <Link
                  to={`/u/${r.username}`}
                  onClick={() => onOpenChange(false)}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <div className="size-11 rounded-full overflow-hidden bg-muted shrink-0 ring-1 ring-border">
                    {r.profile_photo_url && <img loading="lazy" src={r.profile_photo_url} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold truncate">@{r.username}</p>
                      {r.crowns_held > 0 && <Crown size={12} className="text-primary shrink-0" fill="currentColor" />}
                    </div>
                    {r.crowns_held > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        {r.crowns_held} crown{r.crowns_held === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                </Link>
                {!isMe && user && (
                  <Button
                    size="sm"
                    variant={isFollowing ? "outline" : "default"}
                    disabled={isPending}
                    onClick={() => toggle(r.id)}
                    className={`h-8 px-3 text-xs shrink-0 ${isFollowing ? "" : "bg-gradient-gold text-primary-foreground"}`}
                  >
                    {isFollowing ? "Following" : "Follow"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
