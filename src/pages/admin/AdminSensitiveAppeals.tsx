import { useEffect, useState } from "react";
import { ArrowLeft, ShieldAlert, Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Appeal = {
  id: string;
  user_id: string;
  post_id: string | null;
  decision_type: string;
  status: "pending" | "under_review" | "approved" | "denied" | "withdrawn";
  user_statement: string;
  moderator_notes: string | null;
  created_at: string;
  decided_at: string | null;
};

export default function AdminSensitiveAppeals() {
  useSeoMeta({ title: "Sensitive Appeals · Admin", noIndex: true });
  const { isModerator, user } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<Appeal[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const load = async () => {
    let q = supabase.from("sensitive_appeals").select("*").order("created_at", { ascending: false }).limit(200);
    if (filter === "pending") q = q.in("status", ["pending", "under_review"]);
    const { data } = await q;
    setRows((data as Appeal[] | null) ?? []);
  };

  useEffect(() => { if (isModerator) load();   }, [isModerator, filter]);

  const decide = async (id: string, status: "approved" | "denied") => {
    if (!user) return;
    setBusy(id);
    try {
      const { error } = await supabase.rpc("admin_decide_sensitive_appeal" as never, {
        _appeal_id: id,
        _decision: status,
        _notes: notes[id] ?? null,
      } as never);
      if (error) throw error;
      toast.success(`Appeal ${status}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  if (!isModerator) {
    return <AppShell title="APPEALS"><div className="p-8 text-center text-sm text-muted-foreground">Moderator access required.</div></AppShell>;
  }

  return (
    <AppShell title="SENSITIVE APPEALS">
      <div className="px-4 py-4 max-w-3xl mx-auto">
        <button onClick={() => nav(-1)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft size={14} /> Back
        </button>
        <header className="mb-4">
          <div className="flex items-center gap-2 text-gold mb-1">
            <ShieldAlert size={18} />
            <span className="text-[10px] uppercase tracking-widest font-semibold">DSA review queue</span>
          </div>
          <h1 className="font-display text-3xl text-gold">Sensitive Content Appeals</h1>
        </header>

        <div className="flex gap-2 mb-3">
          {(["pending", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted"}`}
            >
              {f === "pending" ? "Pending" : "All"}
            </button>
          ))}
        </div>

        {!rows ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No appeals.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="royal-card p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="text-sm font-semibold capitalize">{r.decision_type.replace(/_/g, " ")}</div>
                    <div className="text-[11px] text-muted-foreground">
                      User {r.user_id.slice(0, 8)} · {new Date(r.created_at).toLocaleString()}
                      {r.post_id && <> · <Link to={`/post/${r.post_id}`} className="underline" target="_blank">view post</Link></>}
                    </div>
                  </div>
                  <span className={`text-xs font-bold uppercase ${
                    r.status === "approved" ? "text-emerald-500" :
                    r.status === "denied" ? "text-destructive" :
                    r.status === "withdrawn" ? "text-muted-foreground" : "text-amber-500"
                  }`}>{r.status}</span>
                </div>
                <p className="text-xs text-foreground/80 whitespace-pre-wrap mb-2">{r.user_statement}</p>

                {(r.status === "pending" || r.status === "under_review") ? (
                  <>
                    <Textarea
                      placeholder="Moderator notes (sent to user)"
                      rows={2}
                      value={notes[r.id] ?? ""}
                      onChange={(e) => setNotes((p) => ({ ...p, [r.id]: e.target.value }))}
                      className="mb-2"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => decide(r.id, "approved")} disabled={busy === r.id}>
                        {busy === r.id ? <Loader2 className="size-3 animate-spin" /> : "Approve"}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => decide(r.id, "denied")} disabled={busy === r.id}>
                        Deny
                      </Button>
                    </div>
                  </>
                ) : r.moderator_notes ? (
                  <div className="text-xs text-muted-foreground border-t border-border/60 pt-2 mt-2">
                    <strong>Mod notes:</strong> {r.moderator_notes}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
