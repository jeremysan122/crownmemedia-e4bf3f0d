import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Flag, Inbox, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Report {
  id: string;
  reason: string;
  reason_code: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  post_id: string | null;
  comment_id: string | null;
  mod_notes: string | null;
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  open:         { label: "Under review",   cls: "bg-secondary text-foreground" },
  resolved:     { label: "Resolved",       cls: "bg-emerald-500/15 text-emerald-400" },
  action_taken: { label: "Action taken",   cls: "bg-emerald-500/20 text-emerald-300" },
  dismissed:    { label: "Dismissed",      cls: "bg-muted text-muted-foreground" },
  denied:       { label: "Denied",         cls: "bg-destructive/15 text-destructive" },
};

export default function MyReports() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<Report[] | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("reports")
        .select("id,reason,reason_code,status,created_at,resolved_at,post_id,comment_id,mod_notes")
        .eq("reporter_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (mounted) setItems((data as Report[]) ?? []);
    })();
    return () => { mounted = false; };
  }, [user?.id]);

  return (
    <AppShell title="MY REPORTS">
      <div className="px-4 py-4 max-w-2xl mx-auto space-y-4">
        <button
          onClick={() => nav(-1)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} /> Back
        </button>

        <header>
          <div className="flex items-center gap-2 text-gold">
            <Flag size={18} />
            <h1 className="font-display text-2xl">My reports</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Track enforcement decisions for content you reported. Denied reports can be appealed.
          </p>
        </header>

        {items === null && (
          <div className="space-y-2">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        )}

        {items?.length === 0 && (
          <div className="royal-card p-8 text-center">
            <Inbox className="mx-auto text-muted-foreground mb-2" size={28} />
            <p className="text-sm font-semibold">No reports yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              When you report a post or comment, you'll see its status here.
            </p>
          </div>
        )}

        {items && items.length > 0 && (
          <ul className="royal-card divide-y divide-border">
            {items.map(r => {
              const s = STATUS_STYLE[r.status] ?? { label: r.status, cls: "bg-muted" };
              const canAppeal = r.status === "denied" || r.status === "dismissed";
              return (
                <li key={r.id} className="p-3 flex items-start gap-3">
                  <Flag size={14} className="text-muted-foreground mt-1 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate">{r.reason}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${s.cls}`}>
                        {s.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Submitted {new Date(r.created_at).toLocaleDateString()}
                      {r.resolved_at && ` · Resolved ${new Date(r.resolved_at).toLocaleDateString()}`}
                    </div>
                    {r.mod_notes && (
                      <p className="text-[11px] text-muted-foreground mt-1 italic line-clamp-2">
                        Note: {r.mod_notes}
                      </p>
                    )}
                    {canAppeal && (
                      <Link
                        to={`/reports/${r.id}/appeal`}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-primary mt-1.5 hover:underline"
                      >
                        Submit appeal <ChevronRight size={11} />
                      </Link>
                    )}
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
