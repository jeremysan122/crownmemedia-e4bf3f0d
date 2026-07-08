import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Archive, RotateCcw, Trash2, Crown } from "lucide-react";
import { toast } from "sonner";
import { toFriendlyMessage, logRawError } from "@/lib/settingsSecurityErrors";
import { Button } from "@/components/ui/button";
import { formatScore } from "@/lib/crown";
import ConfirmDialog from "@/components/ConfirmDialog";

interface ArchivedPost {
  id: string;
  image_url: string;
  caption: string | null;
  crown_score: number;
  archived_at: string | null;
}

export default function ArchivedPosts() {
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const [posts, setPosts] = useState<ArchivedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const profilePath = profile?.username ? `/${profile.username}` : "/me";

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("posts")
      .select("id, image_url, caption, crown_score, archived_at")
      .eq("user_id", user.id)
      .eq("is_archived", true as any)
      .eq("is_removed", false)
      .order("archived_at" as any, { ascending: false });
    if (error) toast.error("Failed to load archived posts");
    setPosts((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load();   }, [user?.id]);

  const restore = async (id: string) => {
    const { error } = await supabase
      .from("posts")
      .update({ is_archived: false, archived_at: null } as any)
      .eq("id", id);
    if (error) { logRawError(error, "generic"); return toast.error(toFriendlyMessage(error, "generic")); }
    setPosts((p) => p.filter((x) => x.id !== id));
    toast.success("Post restored");
  };

  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const remove = async () => {
    if (!pendingDelete || removeBusy) return;
    const id = pendingDelete;
    setRemoveBusy(true);
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) {
      setRemoveBusy(false);
      logRawError(error, "generic", { feature: "post_delete", post_id: id, action: "delete", from: "archived" });
      toast.error(toFriendlyMessage(error, "generic"));
      return;
    }
    setPosts((p) => p.filter((x) => x.id !== id));
    window.dispatchEvent(new CustomEvent("post:deleted", { detail: { id } }));
    toast.success("Post deleted");
    setRemoveBusy(false);
    setPendingDelete(null);
  };

  return (
    <AppShell title="ARCHIVED">
      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center gap-2">
          <Archive size={18} className="text-gold" />
          <h1 className="font-display text-2xl text-gold">Archived posts</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Only you can see these. Restore to put them back in your profile and feeds.
        </p>

        {loading ? (
          <div className="grid grid-cols-3 gap-1">{[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="aspect-square bg-muted animate-pulse rounded-md" />
          ))}</div>
        ) : posts.length === 0 ? (
          <div className="royal-card p-10 text-center">
            <Archive size={28} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Nothing archived.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => nav(profilePath)}>Back to profile</Button>
          </div>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {posts.map((p) => (
              <li key={p.id} className="royal-card overflow-hidden">
                <div className="aspect-square bg-muted relative">
                  <img loading="lazy" src={p.image_url} alt="" className="w-full h-full object-cover opacity-80" />
                  <div className="absolute bottom-1 right-1 glass px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1">
                    <Crown size={9} className="text-primary" fill="currentColor" />
                    {formatScore(p.crown_score)}
                  </div>
                </div>
                <div className="flex">
                  <button onClick={() => restore(p.id)} className="flex-1 py-2 text-[11px] font-bold flex items-center justify-center gap-1 hover:bg-primary/10 text-primary">
                    <RotateCcw size={12} /> Restore
                  </button>
                  <button onClick={() => setPendingDelete(p.id)} className="flex-1 py-2 text-[11px] font-bold flex items-center justify-center gap-1 hover:bg-destructive/10 text-destructive border-l border-border/40">
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title="Delete post?"
        description="This can't be undone."
        confirmLabel="Delete post"
        destructive
        loading={removeBusy}
        onConfirm={remove}
      />
    </AppShell>
  );
}
