import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Image as ImageIcon, Check } from "lucide-react";

interface MyPost {
  id: string;
  caption: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  media_type: string | null;
  video_poster_url: string | null;
  filter: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  userId: string | undefined;
  boostLabel: string;
  onClose: () => void;
  onPick: (postId: string) => void;
}

export default function BoostPostPicker({ open, userId, boostLabel, onClose, onPick }: Props) {
  const [posts, setPosts] = useState<MyPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    setSelected(null);
    (async () => {
      const { data } = await supabase
        .from("posts")
        .select("id, caption, created_at")
        .eq("user_id", userId)
        .eq("is_removed", false)
        .order("created_at", { ascending: false })
        .limit(50);
      setPosts((data as MyPost[]) || []);
      setLoading(false);
    })();
  }, [open, userId]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Choose a post to boost</DialogTitle>
          <DialogDescription>
            {boostLabel} will apply to the post you select. Pick one of your posts below.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="animate-spin" /></div>
        ) : posts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            You don't have any posts yet. Create a post first, then come back to boost it.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 max-h-[50vh] overflow-y-auto py-2">
              {posts.map((p) => {
                const isSel = selected === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p.id)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition ${isSel ? "border-gold ring-2 ring-gold/40" : "border-border/40 hover:border-gold/40"}`}
                  >
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.caption ?? "post"} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <ImageIcon size={20} className="text-muted-foreground" />
                      </div>
                    )}
                    {isSel && (
                      <div className="absolute inset-0 bg-gold/20 flex items-center justify-center">
                        <div className="size-7 rounded-full bg-gold text-primary-foreground flex items-center justify-center">
                          <Check size={16} />
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={onClose}
                className="flex-1 h-10 rounded-full border border-border/60 text-sm font-bold uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                onClick={() => selected && onPick(selected)}
                disabled={!selected}
                className="flex-1 h-10 rounded-full bg-gradient-gold text-primary-foreground text-sm font-bold uppercase tracking-wider gold-shadow disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
