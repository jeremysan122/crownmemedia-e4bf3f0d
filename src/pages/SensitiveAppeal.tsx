import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ShieldAlert, Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * DSA-compliant appeal form. The user explains why the sensitive label /
 * restriction / removal was incorrect. Moderators review in the admin queue.
 */
export default function SensitiveAppeal() {
  useSeoMeta({ title: "Appeal Sensitive Decision · CrownMe", noIndex: true });
  const { user } = useAuth();
  const { postId } = useParams();
  const nav = useNavigate();
  const [statement, setStatement] = useState("");
  const [decisionType, setDecisionType] = useState<"sensitive_label" | "blur" | "removed" | "age_gated">("sensitive_label");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user) { toast.error("Sign in to file an appeal."); return; }
    if (statement.trim().length < 20) { toast.error("Please describe the issue (min 20 chars)."); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("sensitive_appeals").insert({
        user_id: user.id,
        post_id: postId ?? null,
        decision_type: decisionType,
        user_statement: statement.trim(),
      });
      if (error) throw error;
      toast.success("Appeal filed — you'll be notified on a decision.");
      nav("/appeals/sensitive", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to file appeal.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="APPEAL DECISION">
      <div className="px-4 py-4 max-w-xl mx-auto">
        <button onClick={() => nav(-1)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft size={14} /> Back
        </button>
        <header className="mb-5">
          <div className="flex items-center gap-2 text-gold mb-1">
            <ShieldAlert size={18} />
            <span className="text-[10px] uppercase tracking-widest font-semibold">DSA Notice & Appeal</span>
          </div>
          <h1 className="font-display text-3xl text-gold">Appeal a sensitive content decision</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Under our <Link to="/sensitive-content" className="underline text-primary">Sensitive Content Policy</Link> and EU DSA Art. 20,
            you have the right to challenge labels, blurring, age-gating, or removals on your content.
          </p>
        </header>

        <div className="space-y-4 royal-card p-4">
          <div>
            <label className="text-xs font-semibold mb-1 block">Decision being appealed</label>
            <select
              value={decisionType}
              onChange={(e) => setDecisionType(e.target.value as typeof decisionType)}
              className="w-full h-10 px-3 rounded-md bg-input text-sm"
            >
              <option value="sensitive_label">Marked as sensitive</option>
              <option value="blur">Blurred for viewers</option>
              <option value="age_gated">Age-gated</option>
              <option value="removed">Removed</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block">Why is this decision wrong? (min 20 chars)</label>
            <Textarea
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="Explain why this content does not violate our policies, and provide any relevant context."
            />
            <p className="text-[10px] text-muted-foreground mt-1">{statement.length}/2000</p>
          </div>
          <Button onClick={submit} disabled={busy} className="w-full">
            {busy ? <Loader2 className="size-4 animate-spin" /> : "File appeal"}
          </Button>
          <p className="text-[10px] text-muted-foreground">
            We aim to respond within 7 business days. You will be notified in-app and by email.
            See your appeal status at <Link to="/appeals/sensitive" className="underline text-primary">My Appeals</Link>.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

export function SensitiveAppealsList() {
  useSeoMeta({ title: "My Sensitive Appeals · CrownMe", noIndex: true });
  const { user } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<Array<{
    id: string; post_id: string | null; decision_type: string; status: string;
    user_statement: string; moderator_notes: string | null; created_at: string; decided_at: string | null;
  }> | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("sensitive_appeals")
      .select("id, post_id, decision_type, status, user_statement, moderator_notes, created_at, decided_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
  }, [user]);

  const statusColor = (s: string) =>
    s === "approved" ? "text-emerald-500" :
    s === "denied" ? "text-destructive" :
    s === "withdrawn" ? "text-muted-foreground" : "text-amber-500";

  return (
    <AppShell title="MY APPEALS">
      <div className="px-4 py-4 max-w-2xl mx-auto">
        <button onClick={() => nav(-1)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft size={14} /> Back
        </button>
        <h1 className="font-display text-3xl text-gold mb-4">My Sensitive Appeals</h1>
        {!rows ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">You haven't filed any appeals yet.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="royal-card p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="text-sm font-semibold capitalize">{r.decision_type.replace(/_/g, " ")}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Filed {new Date(r.created_at).toLocaleDateString()}
                      {r.post_id && <> · <Link to={`/post/${r.post_id}`} className="underline">view post</Link></>}
                    </div>
                  </div>
                  <span className={`text-xs font-bold uppercase ${statusColor(r.status)}`}>{r.status.replace(/_/g, " ")}</span>
                </div>
                <p className="text-xs text-foreground/80 whitespace-pre-wrap">{r.user_statement}</p>
                {r.moderator_notes && (
                  <div className="mt-2 pt-2 border-t border-border/60">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Moderator response</div>
                    <p className="text-xs text-foreground/80 whitespace-pre-wrap">{r.moderator_notes}</p>
                    {r.decided_at && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Decided {new Date(r.decided_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
