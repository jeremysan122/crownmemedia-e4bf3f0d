import { supabase } from "@/integrations/supabase/client";
import { LEGAL_DOCS, REQUIRED_DOC_SLUGS, type LegalDoc } from "@/lib/legalDocs";

export type AcceptanceRow = {
  doc_slug: string;
  version: string;
  last_updated: string | null;
  accepted_at: string;
};

export async function recordAcceptances(
  userId: string,
  slugs: string[],
  source: string,
): Promise<void> {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
  const rows = slugs
    .map((s) => LEGAL_DOCS.find((d) => d.slug === s))
    .filter((d): d is LegalDoc => !!d)
    .map((d) => ({
      user_id: userId,
      doc_slug: d.slug,
      version: d.version,
      last_updated: d.lastUpdated,
      source,
      user_agent: ua,
    }));
  if (!rows.length) return;
  // ignore duplicate-key errors (already accepted that version)
  await supabase
    .from("user_legal_acceptances")
    // @ts-expect-error onConflict variant
    .upsert(rows, { onConflict: "user_id,doc_slug,version", ignoreDuplicates: true });
}

export async function fetchMyAcceptances(userId: string): Promise<AcceptanceRow[]> {
  const { data } = await supabase
    .from("user_legal_acceptances")
    .select("doc_slug, version, last_updated, accepted_at")
    .eq("user_id", userId)
    .order("accepted_at", { ascending: false });
  return (data as AcceptanceRow[] | null) ?? [];
}

/** Returns slugs of REQUIRED docs whose current version the user has NOT accepted. */
export async function getOutstandingConsents(userId: string): Promise<LegalDoc[]> {
  const accepted = await fetchMyAcceptances(userId);
  const acceptedSet = new Set(accepted.map((r) => `${r.doc_slug}@${r.version}`));
  return LEGAL_DOCS.filter(
    (d) => d.required && !acceptedSet.has(`${d.slug}@${d.version}`),
  );
}

export { REQUIRED_DOC_SLUGS };
