// Follow / Unfollow a specific battler. Powers notify-on-live.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  battlerId: string;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "ghost";
  className?: string;
}

export default function FollowBattlerButton({ battlerId, size = "sm", variant = "outline", className }: Props) {
  const { user } = useAuth();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.id || !battlerId || user.id === battlerId) { setFollowing(null); return; }
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("battler_follows")
        .select("id")
        .eq("follower_id", user.id)
        .eq("battler_id", battlerId)
        .maybeSingle();
      if (alive) setFollowing(!!data);
    })();
    return () => { alive = false; };
  }, [user?.id, battlerId]);

  if (!user?.id || user.id === battlerId || following === null) return null;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (following) {
        const { error } = await supabase
          .from("battler_follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("battler_id", battlerId);
        if (error) throw error;
        setFollowing(false);
        toast.success("You'll no longer get notified");
      } else {
        const { error } = await supabase
          .from("battler_follows")
          .insert({ follower_id: user.id, battler_id: battlerId });
        if (error) throw error;
        setFollowing(true);
        toast.success("You'll be notified when they go live");
      }
    } catch {
      toast.error("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      size={size}
      variant={following ? "ghost" : variant}
      onClick={toggle}
      disabled={busy}
      className={className}
      aria-pressed={following}
      aria-label={following ? "Unfollow battler" : "Follow battler to get notified"}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : following ? <BellOff size={14} /> : <Bell size={14} />}
      <span className="ml-1.5">{following ? "Following" : "Notify me"}</span>
    </Button>
  );
}
