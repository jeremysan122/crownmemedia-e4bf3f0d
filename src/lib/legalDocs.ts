// Single-source registry of all legal documents.
// When you bump a version here, users who accepted an older version of a
// REQUIRED doc will be prompted for renewed consent on next login.

export type LegalDoc = {
  slug: string;          // stable id used in the acceptance log
  route: string;         // app route to view the doc
  label: string;
  desc: string;
  version: string;
  effectiveDate: string;
  lastUpdated: string;
  pdfSlug?: string;      // file in /public/legal/{pdfSlug}.pdf if present
  required: boolean;     // signup must accept these; renewed consent triggers on bump
};

const V = "1.3";
const UP = "July 13, 2026";
const EFF = "July 13, 2026";

export const LEGAL_DOCS: LegalDoc[] = [
  { slug: "terms",                route: "/terms",                label: "Terms of Service",                desc: "The contract between you and CrownMe Media.",                                          version: V,     effectiveDate: EFF,         lastUpdated: UP, pdfSlug: "crownme-terms",                required: true  },
  { slug: "privacy",              route: "/privacy",              label: "Privacy Policy",                  desc: "What we collect, why, and your rights (GDPR, CCPA, UK GDPR).",                          version: V,     effectiveDate: EFF,         lastUpdated: UP, pdfSlug: "crownme-privacy",              required: true  },
  { slug: "community",            route: "/conduct",              label: "Community Guidelines",            desc: "What's allowed and what gets you removed.",                                             version: V,     effectiveDate: EFF,         lastUpdated: UP, pdfSlug: "crownme-community-guidelines", required: true  },
  { slug: "acceptable-use",       route: "/acceptable-use",       label: "Acceptable Use Policy",           desc: "Prohibited content and behavior in detail.",                                            version: V,     effectiveDate: EFF,         lastUpdated: UP, pdfSlug: "crownme-conduct",              required: false },
  { slug: "csae",                 route: "/csae-policy",          label: "Child Safety (CSAE)",             desc: "Zero tolerance for child sexual abuse and exploitation.",                               version: V,     effectiveDate: EFF,         lastUpdated: UP, required: true  },
  { slug: "sensitive-content",    route: "/sensitive-content",    label: "Sensitive Content Policy",        desc: "Ratings, blur, age gating, moderation, and audit logging.",                             version: V,     effectiveDate: "June 2, 2026", lastUpdated: UP, required: false },
  { slug: "cookies",              route: "/cookies",              label: "Cookie Policy",                   desc: "How we use cookies and similar technologies.",                                          version: V,     effectiveDate: EFF,         lastUpdated: UP, required: false },
  { slug: "dmca",                 route: "/dmca",                 label: "DMCA & Copyright",                desc: "How to report copyright infringement.",                                                 version: V,     effectiveDate: EFF,         lastUpdated: UP, required: false },
  { slug: "virtual-goods",        route: "/virtual-goods",        label: "Virtual Goods & No-Gambling",     desc: "Shekels, crowns, gifts — no real-money value.",                                         version: V,     effectiveDate: EFF,         lastUpdated: UP, required: false },
  { slug: "subscription-terms",   route: "/subscription-terms",   label: "Subscription Terms (Royal Pass)", desc: "Billing, renewal, and cancellation.",                                                   version: V,     effectiveDate: EFF,         lastUpdated: UP, required: false },
  { slug: "eula",                 route: "/eula",                 label: "End-User License Agreement",      desc: "License covering your use of the CrownMe Media app.",                                   version: V,     effectiveDate: EFF,         lastUpdated: UP, required: false },
  { slug: "contact-legal",        route: "/contact-legal",        label: "Legal Contact & DPO",             desc: "Reach our legal, privacy, and safety teams.",                                           version: V,     effectiveDate: EFF,         lastUpdated: UP, required: false },
];

export const REQUIRED_DOC_SLUGS = LEGAL_DOCS.filter((d) => d.required).map((d) => d.slug);

export function getLegalDoc(slug: string): LegalDoc | undefined {
  return LEGAL_DOCS.find((d) => d.slug === slug);
}

export function pdfHref(doc: LegalDoc): string | null {
  return doc.pdfSlug ? `/legal/${doc.pdfSlug}.pdf` : null;
}
