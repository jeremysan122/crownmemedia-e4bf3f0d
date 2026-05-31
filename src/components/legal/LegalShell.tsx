import { ReactNode } from "react";
import AppShell from "@/components/AppShell";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Scale, Download, Printer } from "lucide-react";
import { useSeoMeta } from "@/hooks/useSeoMeta";

interface Props {
  title: string;
  effectiveDate: string;
  /** Document version (defaults to "1.0"). Bump on substantive changes. */
  version?: string;
  /** Last updated date (defaults to effectiveDate when unchanged). */
  lastUpdated?: string;
  shellTitle?: string;
  /** If set, shows a "Download PDF" button linking to /legal/{pdfSlug}.pdf */
  pdfSlug?: string;
  /** Optional custom SEO description; defaults to a standard "official {title}" line. */
  seoDescription?: string;
  children: ReactNode;
}

/**
 * Shared layout for every long-form legal/policy page.
 * Provides consistent typography, back nav, version + dates header,
 * and a footer link back to the Legal Center.
 *
 * NOTE — Internal: policy text drafted by the product team. Final
 * attorney review is recommended before public launch and on any
 * substantive change. Bump `version` and `lastUpdated` together.
 */
export default function LegalShell({
  title,
  effectiveDate,
  version = "1.0",
  lastUpdated,
  shellTitle,
  pdfSlug,
  seoDescription,
  children,
}: Props) {
  const updated = lastUpdated ?? effectiveDate;
  const nav = useNavigate();
  useSeoMeta({
    title: `${title} — CrownMe Media`,
    description:
      seoDescription ??
      `Official ${title} for CrownMe Media — the 18+ social photo competition. Effective ${effectiveDate}.`,
    type: "article",
  });
  return (
    <AppShell title={(shellTitle ?? title).toUpperCase()}>
      <div className="px-4 py-4 max-w-3xl mx-auto">
        <button
          onClick={() => nav(-1)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
          aria-label="Go back"
        >
          <ArrowLeft size={14} /> Back
        </button>

        <header className="mb-5 pb-4 border-b border-border/60">
          <div className="flex items-center gap-2 text-gold mb-1">
            <Scale size={18} />
            <span className="text-[10px] uppercase tracking-widest font-semibold">Legal Document</span>
          </div>
          <h1 className="font-display text-3xl text-gold">{title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-2 py-0.5 font-semibold text-foreground/80">
              Version {version}
            </span>
            <span><strong className="text-foreground/80">Effective:</strong> {effectiveDate}</span>
            <span><strong className="text-foreground/80">Last Updated:</strong> {updated}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Published by <strong>CrownMe Media</strong> · Contact:{" "}
            <a className="underline text-primary" href="mailto:legal@crownmemedia.com">legal@crownmemedia.com</a>
            {" "}· <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>
          </p>
          {pdfSlug && (
            <div className="flex flex-wrap gap-2 mt-3 print:hidden">
              <a
                href={`/legal/${pdfSlug}.pdf`}
                download
                className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-gradient-gold text-primary-foreground hover:opacity-90"
              >
                <Download size={12} /> Download PDF
              </a>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-muted text-foreground hover:bg-muted/70"
              >
                <Printer size={12} /> Print / Save as PDF
              </button>
            </div>
          )}
        </header>

        <article className="legal-prose space-y-4 text-sm leading-relaxed text-foreground/90">
          {children}
        </article>

        <footer className="mt-8 pt-4 border-t border-border/60 text-[11px] text-muted-foreground space-y-1">
          <p>
            Visit the <Link to="/legal" className="underline text-primary">Legal Center</Link> for all CrownMe Media policies.
          </p>
          <p>© {new Date().getFullYear()} CrownMe Media. CrownMe® is a registered trademark. All rights reserved.</p>
        </footer>
      </div>
    </AppShell>
  );
}

export const H2 = ({ children }: { children: ReactNode }) => (
  <h2 className="font-display text-xl text-gold mt-6 mb-2">{children}</h2>
);
export const H3 = ({ children }: { children: ReactNode }) => (
  <h3 className="font-semibold text-base text-foreground mt-4 mb-1">{children}</h3>
);
export const P = ({ children }: { children: ReactNode }) => (
  <p className="text-sm leading-relaxed">{children}</p>
);
export const UL = ({ children }: { children: ReactNode }) => (
  <ul className="list-disc pl-5 space-y-1 text-sm leading-relaxed">{children}</ul>
);
