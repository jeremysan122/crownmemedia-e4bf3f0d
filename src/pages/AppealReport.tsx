import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Gavel, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import EvidenceUpload from "@/components/EvidenceUpload";

interface Appeal {
  id: string;
  status: string;
  body: string;
  mod_notes: string | null;
  created_at: string;
}

export default function AppealReport() {
  const { reportId } = useParams<{ reportId: string }>();
  const { user } = useAuth();
  const nav = useNavigate();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [existing, setExisting] = useState<Appeal[] | null>(null);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [evidencePaths, setEvidencePaths] = useState<string[]>([]);

  useEffect(() => {
    if (!user?.id || !reportId) return;
    let mounted = true;
    (async () => {
      const [{ data: r }, { data: appeals }] = await Promise.all([
        supabase.from("reports").select("reason,status").eq("id", reportId).maybeSingle(),
        supabase.from("report_appeals")
          .select("id,status,body,mod_notes,created_at")
          .eq("report_id", reportId)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);
      if (!mounted) return;
      setReportReason((r as { reason: string } | null)?.reason ?? null);
      setExisting((appeals as unknown as Appeal[]) ?? []);
    })();
    return () => { mounted = false; };
  }, [user?.id, reportId]);

  const submit = async () => {
    setErr(null);
    if (!user?.id || !reportId) {
      setErr("You must be signed in to submit an appeal.");
      return;
    }
    const trimmed = body.trim();
    if (trimmed.length < 20) {
      setErr("Please write at least 20 characters explaining your appeal.");
      return;
    }
    if (trimmed.length > 2000) {
      setErr("Appeal must be 2000 characters or fewer.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("report_appeals").insert({
        report_id: reportId,
        user_id: user.id,
        body: trimmed,
        evidence_paths: evidencePaths,
      });
      if (error) throw error;
      toast.success("Appeal submitted — we'll re-review within 7 days.");
      setBody("");
      setEvidencePaths([]);
      // Refresh the appeals list
      const { data } = await supabase.from("report_appeals")
        .select("id,status,body,mod_notes,created_at")
        .eq("report_id", reportId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setExisting((data as unknown as Appeal[]) ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not submit appeal";
      setErr(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell title="APPEAL DECISION">
      <div className="px-4 py-4 max-w-2xl mx-auto space-y-4">
        <button
          onClick={() => nav(-1)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} /> Back
        </button>

        <header>
          <div className="flex items-center gap-2 text-gold">
            <Gavel size={18} />
            <h1 className="font-display text-2xl">Appeal a decision</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            If you believe this report was incorrectly handled, you can submit one appeal per
            report. Our team will re-review within 7 days.
          </p>
        </header>

        {reportReason && (
          <div className="royal-card p-3 text-xs">
            <span className="text-muted-foreground">Original report: </span>
            <span className="font-semibold">{reportReason}</span>
          </div>
        )}

        {existing === null && <Skeleton className="h-20 w-full" />}

        {existing && existing.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
              Previous appeals
            </h2>
            {existing.map(a => (
              <div key={a.id} className="royal-card p-3 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold capitalize">{a.status}</span>
                  <span className="text-muted-foreground">
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{a.body}</p>
                {a.mod_notes && (
                  <p className="text-[11px] text-foreground/80 border-t border-border/40 pt-1 mt-1">
                    <ShieldCheck size={10} className="inline mr-1 text-gold" />
                    Moderator: {a.mod_notes}
                  </p>
                )}
              </div>
            ))}
          </section>
        )}

        {existing && existing.length === 0 && (
          <section className="royal-card p-4 space-y-3">
            <div>
              <Label htmlFor="appeal-body">Your appeal</Label>
              <Textarea
                id="appeal-body"
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Explain why this decision should be reconsidered. Include any context that wasn't visible in the original report."
                className="bg-input mt-1 min-h-[140px]"
                maxLength={2000}
              />
              <div className="text-right text-[10px] text-muted-foreground tabular-nums">
                {body.length}/2000 (min 20)
              </div>
            </div>

            {user?.id && (
              <EvidenceUpload
                userId={user.id}
                kind="appeals"
                paths={evidencePaths}
                onChange={setEvidencePaths}
                disabled={submitting}
              />
            )}

            {err && <p className="text-xs text-destructive" role="alert">{err}</p>}

            <Button
              onClick={submit}
              disabled={submitting}
              className="w-full bg-gradient-gold text-primary-foreground"
            >
              {submitting ? "Submitting…" : "Submit appeal"}
            </Button>
            <p className="text-[10px] text-muted-foreground">
              See our <Link to="/conduct" className="underline text-primary">Community Guidelines</Link> for what we
              enforce. Repeated bad-faith appeals may result in account action.
            </p>
          </section>
        )}
      </div>
    </AppShell>
  );
}
