import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, AlertTriangle, CheckCircle2, RefreshCcw } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { Button } from "@/components/ui/button";
import { logRawError } from "@/lib/settingsSecurityErrors";

/**
 * Owner-only "Pending" view.
 *
 * Lists the current user's non-approved posts so a freshly-submitted upload
 * never feels like it disappeared. RLS does the heavy lifting:
 * `posts_owner_read_any` lets the signed-in user read all of their own rows
 * regardless of publish_status, while `posts_public_read_approved` keeps
 * everyone else out. We additionally scope by `user_id = auth.uid()` for
 * defence in depth.
 */
type StatusRow = {
  id: string;
  caption: string | null;
  image_url: string | null;
  publish_status: "draft" | "processing" | "pending_review" | "approved" | "rejected";
  created_at: string;
};

const STATUS_META: Record<StatusRow["publish_status"], { label: string; tone: string; icon: typeof Clock; help: string }> = {
  draft:          { label: "Draft",          tone: "bg-muted text-muted-foreground",          icon: Clock,         help: "Finish this draft in Upload to submit it for review." },
  processing:     { label: "Processing",     tone: "bg-blue-500/15 text-blue-400",            icon: RefreshCcw,    help: "We're finalizing your media — this usually takes a few seconds." },
  pending_review: { label: "Pending review", tone: "bg-amber-500/15 text-amber-400",          icon: Clock,         help: "Your post is in moderation. It'll appear publicly once approved." },
  approved:       { label: "Published",      tone: "bg-emerald-500/15 text-emerald-400",      icon: CheckCircle2,  help: "Live on the feed." },
  rejected:       { label: "Rejected",       tone: "bg-red-500/15 text-red-400",              icon: AlertTriangle, help: "This post was rejected by moderation. You can edit and resubmit, or delete it." },
};

export default function Pending() {
  const { user } = useAuth();
  const [rows, setRows] = useState<StatusRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useSeoMeta({ title: "Pending posts · CrownMe", description: "Your posts awaiting review or attention." });

  const load = async () => {
    if (!user) return;
    setError(null);
    const { data, error } = await (supabase as any)
      .from("posts")
      .select("id, caption, image_url, publish_status, created_at")
      .eq("user_id", user.id)
      .neq("publish_status", "approved")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) { logRawError(error, "generic", { feature: "pending_load" }); setError("Couldn't load your pending posts. Try again."); return; }
    setRows((data ?? []) as StatusRow[]);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  return (
    <AppShell title="PENDING">
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl text-gold">Pending &amp; review</h1>
          <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCcw size={14} className="mr-1" />Refresh</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Posts you've submitted that aren't live yet. Only you can see this list.
        </p>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            Couldn't load: {error}
          </div>
        )}

        {rows === null ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-12 text-center">
            Nothing waiting for review. Approved posts live on your <Link to="/feed" className="underline">feed</Link>.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((p) => {
              const meta = STATUS_META[p.publish_status] ?? STATUS_META.pending_review;
              const Icon = meta.icon;
              return (
                <li key={p.id} className="flex gap-3 rounded-xl border border-border bg-card p-3">
                  {p.image_url ? (
                    <img loading="lazy" src={p.image_url} alt="" className="size-16 rounded-md object-cover bg-muted shrink-0" />
                  ) : (
                    <div className="size-16 rounded-md bg-muted shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${meta.tone}`}>
                        <Icon size={10} />
                        {meta.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {new Date(p.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm line-clamp-2 break-words">{p.caption || <span className="text-muted-foreground italic">No caption</span>}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{meta.help}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
