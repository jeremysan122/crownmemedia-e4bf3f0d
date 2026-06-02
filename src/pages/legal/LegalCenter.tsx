import AppShell from "@/components/AppShell";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Scale,
  FileText,
  Lock,
  Cookie,
  Gavel,
  Coins,
  Receipt,
  Baby,
  BookOpen,
  ShieldCheck,
  Mail,
  EyeOff,
  ChevronRight,
} from "lucide-react";

const VERSION = "1.1";
const LAST_UPDATED = "June 2, 2026";

const docs = [
  { to: "/terms", label: "Terms of Service", desc: "The contract between you and CrownMe Media.", Icon: FileText, version: VERSION, updated: LAST_UPDATED },
  { to: "/privacy", label: "Privacy Policy", desc: "What we collect, why, and your rights (GDPR, CCPA, UK GDPR).", Icon: Lock, version: VERSION, updated: LAST_UPDATED },
  { to: "/conduct", label: "Community Guidelines", desc: "What's allowed and what gets you removed.", Icon: BookOpen, version: VERSION, updated: LAST_UPDATED },
  { to: "/cookies", label: "Cookie Policy", desc: "How we use cookies and similar technologies.", Icon: Cookie, version: VERSION, updated: LAST_UPDATED },
  { to: "/dmca", label: "DMCA & Copyright", desc: "How to report copyright infringement.", Icon: Gavel, version: VERSION, updated: LAST_UPDATED },
  { to: "/virtual-goods", label: "Virtual Goods & No-Gambling", desc: "Shekels, crowns, gifts — no real-money value.", Icon: Coins, version: VERSION, updated: LAST_UPDATED },
  { to: "/subscription-terms", label: "Subscription Terms (Royal Pass)", desc: "Billing, renewal, and cancellation.", Icon: Receipt, version: VERSION, updated: LAST_UPDATED },
  { to: "/csae-policy", label: "Child Safety (CSAE Standards)", desc: "Zero tolerance for child sexual abuse and exploitation.", Icon: Baby, version: VERSION, updated: LAST_UPDATED },
  { to: "/sensitive-content", label: "Sensitive Content Policy", desc: "Ratings, blur, age gating, moderation, and audit logging across every surface.", Icon: EyeOff, version: "1.0", updated: LAST_UPDATED },
  { to: "/eula", label: "End-User License Agreement (EULA)", desc: "License covering your use of the CrownMe Media app.", Icon: ShieldCheck, version: VERSION, updated: LAST_UPDATED },
  { to: "/acceptable-use", label: "Acceptable Use Policy", desc: "Prohibited content and behavior in detail.", Icon: BookOpen, version: VERSION, updated: LAST_UPDATED },
  { to: "/contact-legal", label: "Legal Contact & DPO", desc: "Reach our legal, privacy, and safety teams.", Icon: Mail, version: VERSION, updated: LAST_UPDATED },
];

export default function LegalCenter() {
  const nav = useNavigate();
  return (
    <AppShell title="LEGAL CENTER">
      <div className="px-4 py-4 max-w-3xl mx-auto">
        <button
          onClick={() => nav(-1)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
          aria-label="Go back"
        >
          <ArrowLeft size={14} /> Back
        </button>

        <header className="mb-5">
          <div className="flex items-center gap-2 text-gold mb-1">
            <Scale size={20} />
            <span className="text-[10px] uppercase tracking-widest font-semibold">CrownMe Media Legal Center</span>
          </div>
          <h1 className="font-display text-3xl text-gold">Policies & Agreements</h1>
          <p className="text-xs text-muted-foreground mt-1">
            All policies governing your use of CrownMe Media.
          </p>
        </header>

        <section className="royal-card p-4 mb-5 space-y-2">
          <h2 className="font-display text-sm uppercase tracking-widest text-gold">
            Legal Contact &amp; Mailing Address
          </h2>
          <address className="not-italic text-xs text-foreground/90 leading-relaxed">
            <strong>CrownMe Media</strong><br />
            Web: <a className="underline text-primary" href="https://www.crownmemedia.com">www.crownmemedia.com</a><br />
            Email:{" "}
            <a className="underline text-primary" href="mailto:support@crownmemedia.com">
              support@crownmemedia.com
            </a>
          </address>
          <p className="text-[10px] text-muted-foreground">
            For Apple App Store, Google Play, GDPR, CCPA, and DMCA correspondence, use the email
            above with the appropriate subject line (see{" "}
            <Link to="/contact-legal" className="underline text-primary">Legal Contact &amp; DPO</Link>).
            Full street address is provided to verified legal process on request.
          </p>
        </section>

        <section className="royal-card divide-y divide-border">
          {docs.map(({ to, label, desc, Icon, version, updated }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors"
              aria-label={label}
            >
              <div className="w-9 h-9 rounded-md bg-muted/40 flex items-center justify-center shrink-0">
                <Icon size={16} className="text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{label}</div>
                <div className="text-[11px] text-muted-foreground">{desc}</div>
                <div className="text-[10px] text-muted-foreground/80 mt-0.5">
                  v{version} · Updated {updated}
                </div>
              </div>
              <ChevronRight size={16} className="text-muted-foreground shrink-0" />
            </Link>
          ))}
        </section>

        <p className="text-[10px] text-muted-foreground text-center mt-6 pb-4">
          © {new Date().getFullYear()} CrownMe Media · CrownMe Media is an 18+ social platform.<br />
          Drafted by the product team; final attorney review recommended before any public revision.
        </p>
      </div>
    </AppShell>
  );
}
