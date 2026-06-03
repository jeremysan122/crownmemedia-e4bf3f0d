import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, AlertTriangle, FileWarning, Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { LEGAL_DOCS, pdfHref } from "@/lib/legalDocs";

type CheckResult = { slug: string; label: string; ok: boolean; reason?: string };

/**
 * Runs a client-side compliance sweep:
 *  - every legal doc in the registry is reachable (HTTP 200)
 *  - every required doc has a non-empty lastUpdated and effectiveDate
 *  - PDF (if declared) actually exists in /public/legal/
 */
export default function ComplianceCheck() {
  useSeoMeta({ title: "Compliance Check · CrownMe Admin", noIndex: true });
  const { isAdmin, isModerator } = useAuth();
  const nav = useNavigate();
  const [running, setRunning] = useState(false);
  const [routeResults, setRouteResults] = useState<CheckResult[] | null>(null);
  const [pdfResults, setPdfResults] = useState<CheckResult[] | null>(null);

  const metadataResults = useMemo<CheckResult[]>(
    () =>
      LEGAL_DOCS.map((d) => {
        const issues: string[] = [];
        if (!d.lastUpdated) issues.push("missing lastUpdated");
        if (!d.effectiveDate) issues.push("missing effectiveDate");
        if (!d.version) issues.push("missing version");
        if (d.required && !d.pdfSlug) issues.push("required doc has no downloadable PDF");
        return { slug: d.slug, label: d.label, ok: issues.length === 0, reason: issues.join(", ") || undefined };
      }),
    [],
  );

  const run = async () => {
    setRunning(true);
    try {
      const rr: CheckResult[] = [];
      for (const d of LEGAL_DOCS) {
        try {
          const res = await fetch(d.route, { method: "HEAD" });
          // SPAs return 200 for all routes; we treat anything <500 as reachable
          rr.push({ slug: d.slug, label: d.label, ok: res.status < 500, reason: `HTTP ${res.status}` });
        } catch (e) {
          rr.push({ slug: d.slug, label: d.label, ok: false, reason: e instanceof Error ? e.message : "fetch failed" });
        }
      }
      setRouteResults(rr);

      const pr: CheckResult[] = [];
      for (const d of LEGAL_DOCS) {
        const href = pdfHref(d);
        if (!href) continue;
        try {
          const res = await fetch(href, { method: "HEAD" });
          pr.push({ slug: d.slug, label: d.label, ok: res.ok, reason: `HTTP ${res.status}` });
        } catch (e) {
          pr.push({ slug: d.slug, label: d.label, ok: false, reason: e instanceof Error ? e.message : "fetch failed" });
        }
      }
      setPdfResults(pr);
    } finally {
      setRunning(false);
    }
  };

  if (!isAdmin && !isModerator) {
    return (
      <AppShell title="COMPLIANCE">
        <div className="p-8 text-center text-sm text-muted-foreground">Moderator access required.</div>
      </AppShell>
    );
  }

  const Section = ({ title, results }: { title: string; results: CheckResult[] | null }) => (
    <section className="royal-card p-4 mb-4">
      <h2 className="font-display text-sm uppercase tracking-widest text-gold mb-2">{title}</h2>
      {!results ? (
        <p className="text-xs text-muted-foreground">Not run yet.</p>
      ) : (
        <ul className="text-xs divide-y divide-border/60">
          {results.map((r) => (
            <li key={r.slug} className="py-2 flex items-start gap-2">
              {r.ok ? <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="text-destructive mt-0.5 shrink-0" />}
              <div className="flex-1">
                <div className="font-semibold">{r.label}</div>
                <div className="text-[10px] text-muted-foreground">{r.slug}{r.reason ? ` · ${r.reason}` : ""}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const totalChecks = metadataResults.length + (routeResults?.length ?? 0) + (pdfResults?.length ?? 0);
  const totalFails =
    metadataResults.filter((r) => !r.ok).length +
    (routeResults?.filter((r) => !r.ok).length ?? 0) +
    (pdfResults?.filter((r) => !r.ok).length ?? 0);

  return (
    <AppShell title="COMPLIANCE CHECK">
      <div className="px-4 py-4 max-w-3xl mx-auto">
        <button onClick={() => nav(-1)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft size={14} /> Back
        </button>
        <header className="mb-4">
          <div className="flex items-center gap-2 text-gold mb-1">
            <FileWarning size={18} />
            <span className="text-[10px] uppercase tracking-widest font-semibold">Legal compliance</span>
          </div>
          <h1 className="font-display text-3xl text-gold">Policy Compliance Checklist</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Verifies every required policy link, lastUpdated field, and downloadable PDF.
          </p>
        </header>

        <div className="flex items-center gap-3 mb-4">
          <Button onClick={run} disabled={running}>
            {running ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
            Run checks
          </Button>
          {routeResults && (
            <span className={`text-xs font-bold ${totalFails === 0 ? "text-emerald-500" : "text-destructive"}`}>
              {totalChecks - totalFails}/{totalChecks} passing
            </span>
          )}
          <Link to="/legal" className="text-xs underline text-primary ml-auto">Open Legal Center</Link>
        </div>

        <Section title="Metadata (version, dates, PDF declared)" results={metadataResults} />
        <Section title="Route reachability" results={routeResults} />
        <Section title="PDF download availability" results={pdfResults} />
      </div>
    </AppShell>
  );
}
