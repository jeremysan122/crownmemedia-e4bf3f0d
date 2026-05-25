import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { FileEdit, Trash2, Plus, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

interface Draft {
  id: string;
  caption: string;
  category: string | null;
  cover_url: string | null;
  image_urls: string[];
  updated_at: string;
}

export default function Drafts() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("post_drafts" as any)
      .select("id, caption, category, cover_url, image_urls, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) toast.error("Failed to load drafts");
    setDrafts((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const remove = async (id: string) => {
    if (!confirm("Delete this draft?")) return;
    const { error } = await supabase.from("post_drafts" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    setDrafts((d) => d.filter((x) => x.id !== id));
    toast.success("Draft deleted");
  };

  return (
    <AppShell title="DRAFTS">
      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl text-gold">Drafts</h1>
          <Button onClick={() => nav("/upload")} size="sm" className="bg-gradient-gold text-primary-foreground">
            <Plus size={14} className="mr-1" /> New post
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => (
            <div key={i} className="royal-card h-20 animate-pulse" />
          ))}</div>
        ) : drafts.length === 0 ? (
          <div className="royal-card p-10 text-center">
            <FileEdit size={28} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No drafts saved yet.</p>
            <p className="text-[11px] text-muted-foreground/70 mt-1">
              Save your work-in-progress from the Upload screen.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {drafts.map((d) => (
              <li key={d.id} className="royal-card p-3 flex items-center gap-3">
                <div className="size-14 rounded-lg bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                  {d.cover_url || d.image_urls?.[0] ? (
                    <img loading="lazy" src={d.cover_url || d.image_urls[0]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon size={18} className="text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{d.caption || "Untitled draft"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {d.category ? `${d.category} · ` : ""}Updated {new Date(d.updated_at).toLocaleString()}
                  </p>
                </div>
                <Link
                  to={`/upload?draft=${d.id}`}
                  className="text-[11px] font-bold uppercase tracking-wider text-primary hover:underline"
                >
                  Open
                </Link>
                <button
                  onClick={() => remove(d.id)}
                  className="size-8 rounded-full hover:bg-destructive/15 flex items-center justify-center text-muted-foreground hover:text-destructive"
                  aria-label="Delete draft"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
