import AppShell from "@/components/AppShell";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Scale, ChevronRight, Download, Printer } from "lucide-react";
import { LEGAL_DOCS, pdfHref } from "@/lib/legalDocs";
import {
  FileText, Lock, Cookie, Gavel, Coins, Receipt, Baby, BookOpen,
  ShieldCheck, Mail, EyeOff,
} from "lucide-react";

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  terms: FileText,
  privacy: Lock,
  community: BookOpen,
  "acceptable-use": BookOpen,
  cookies: Cookie,
  dmca: Gavel,
  "virtual-goods": Coins,
  "subscription-terms": Receipt,
  csae: Baby,
  "sensitive-content": EyeOff,
  eula: ShieldCheck,
  "contact-legal": Mail,
};

export default function LegalCenter() {
  const nav = useNavigate();

  const printDoc = (route: string) => {
    // Open in new tab for native print preview.
    const w = window.open(route, "_blank", "noopener");
    if (w) setTimeout(() => { try { w.print(); } catch { /* noop */ } }, 800);
  };

  return (
    <AppShell title="LEGAL CENTER">
      <div className="px-4 py-4 max-w-3xl mx-auto">
        <button onClick={() => nav(-1)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3" aria-label="Go back">
          <ArrowLeft size={14} /> Back
        </button>

        <header className="mb-5">
          <div className="flex items-center gap-2 text-gold mb-1">
            <Scale size={20} />
            <span className="text-[10px] uppercase tracking-widest font-semibold">CrownMe Media Legal Center</span>
          </div>
          <h1 className="font-display text-3xl text-gold">Policies & Agreements</h1>
          <p className="text-xs text-muted-foreground mt-1">
            All policies governing your use of CrownMe Media. Download a PDF copy or print any document for your records.
          </p>
          <div className="mt-2 text-[11px]">
            <Link to="/account/legal" className="underline text-primary">View my acceptance history →</Link>
          </div>
        </header>

        <section className="royal-card p-4 mb-5 space-y-2">
          <h2 className="font-display text-sm uppercase tracking-widest text-gold">
            Legal Contact &amp; Mailing Address
          </h2>
          <address className="not-italic text-xs text-foreground/90 leading-relaxed">
            <strong>CrownMe Media</strong><br />
            Web: <a className="underline text-primary" href="https://www.crownmemedia.com">www.crownmemedia.com</a><br />
            Email: <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>
          </address>
          <p className="text-[10px] text-muted-foreground">
            For Apple App Store, Google Play, GDPR, CCPA, and DMCA correspondence, use the email above with the appropriate subject line
            (see <Link to="/contact-legal" className="underline text-primary">Legal Contact &amp; DPO</Link>).
          </p>
        </section>

        <section className="royal-card divide-y divide-border">
          {LEGAL_DOCS.map((d) => {
            const Icon = ICONS[d.slug] ?? FileText;
            const pdf = pdfHref(d);
            return (
              <div key={d.slug} className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors">
                <Link to={d.route} className="flex items-center gap-3 flex-1 min-w-0" aria-label={d.label}>
                  <div className="w-9 h-9 rounded-md bg-muted/40 flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">
                      {d.label}
                      {d.required && <span className="ml-2 text-[9px] uppercase tracking-wider text-gold/80">Required</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{d.desc}</div>
                    <div className="text-[10px] text-muted-foreground/80 mt-0.5">v{d.version} · Updated {d.lastUpdated}</div>
                  </div>
                </Link>
                <div className="flex items-center gap-1 shrink-0">
                  {pdf && (
                    <a
                      href={pdf}
                      download
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                      aria-label={`Download ${d.label} PDF`}
                      title="Download PDF"
                    >
                      <Download size={14} />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); printDoc(d.route); }}
                    className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                    aria-label={`Print ${d.label}`}
                    title="Print"
                  >
                    <Printer size={14} />
                  </button>
                  <ChevronRight size={16} className="text-muted-foreground" />
                </div>
              </div>
            );
          })}
        </section>

        <p className="text-[10px] text-muted-foreground text-center mt-6 pb-4">
          © {new Date().getFullYear()} CrownMe Media · CrownMe Media is an 18+ social platform.<br />
          Drafted by the product team; final attorney review recommended before any public revision.
        </p>
      </div>
    </AppShell>
  );
}
