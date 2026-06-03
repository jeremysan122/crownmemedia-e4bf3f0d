import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ScrollText, CheckCircle2, AlertCircle } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { fetchMyAcceptances, type AcceptanceRow } from "@/lib/legalAcceptance";
import { LEGAL_DOCS, getLegalDoc } from "@/lib/legalDocs";

export default function AccountLegal() {
  useSeoMeta({ title: "My Legal Acceptances · CrownMe", noIndex: true });
  const { user } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<AcceptanceRow[] | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchMyAcceptances(user.id).then(setRows).catch(() => setRows([]));
  }, [user]);

  // Latest accepted version per slug
  const latestBySlug = new Map<string, AcceptanceRow>();
  (rows ?? []).forEach((r) => {
    const cur = latestBySlug.get(r.doc_slug);
    if (!cur || new Date(r.accepted_at) > new Date(cur.accepted_at)) latestBySlug.set(r.doc_slug, r);
  });

  return (
    <AppShell title="MY ACCEPTANCES">
      <div className="px-4 py-4 max-w-2xl mx-auto">
        <button onClick={() => nav(-1)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft size={14} /> Back
        </button>
        <header className="mb-5">
          <div className="flex items-center gap-2 text-gold mb-1">
            <ScrollText size={18} />
            <span className="text-[10px] uppercase tracking-widest font-semibold">Compliance record</span>
          </div>
          <h1 className="font-display text-3xl text-gold">Legal Acceptances</h1>
          <p className="text-xs text-muted-foreground mt-1">
            The exact policy versions you accepted, when, and the latest version available.
          </p>
        </header>

        <section className="royal-card divide-y divide-border">
          {LEGAL_DOCS.map((doc) => {
            const accepted = latestBySlug.get(doc.slug);
            const upToDate = accepted?.version === doc.version;
            return (
              <div key={doc.slug} className="p-4 flex items-start gap-3">
                <div className={`mt-0.5 ${upToDate ? "text-emerald-500" : accepted ? "text-amber-500" : "text-muted-foreground"}`}>
                  {upToDate ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <Link to={doc.route} className="text-sm font-semibold hover:text-primary">{doc.label}</Link>
                  <div className="text-[11px] text-muted-foreground">
                    Current: v{doc.version} · Updated {doc.lastUpdated}
                  </div>
                  {accepted ? (
                    <div className={`text-[11px] ${upToDate ? "text-emerald-500" : "text-amber-500"}`}>
                      You accepted v{accepted.version} on {new Date(accepted.accepted_at).toLocaleDateString()}
                      {!upToDate && " — a newer version is available"}
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted-foreground">
                      {doc.required ? "Required — not yet accepted." : "Optional — not accepted."}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {rows && rows.length > 0 && (
          <section className="royal-card mt-5 p-4">
            <h2 className="font-display text-sm uppercase tracking-widest text-gold mb-2">Full history</h2>
            <ul className="text-xs space-y-1.5">
              {rows.map((r) => {
                const d = getLegalDoc(r.doc_slug);
                return (
                  <li key={`${r.doc_slug}-${r.version}-${r.accepted_at}`} className="flex justify-between gap-3 border-b border-border/40 pb-1.5">
                    <span>{d?.label ?? r.doc_slug} <span className="text-muted-foreground">v{r.version}</span></span>
                    <span className="text-muted-foreground">{new Date(r.accepted_at).toLocaleString()}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}
