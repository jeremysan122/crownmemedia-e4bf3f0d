import { LEGAL_DOCS } from "../../src/lib/legalDocs";

/**
 * Build the rows returned by the mocked user_legal_acceptances endpoint from
 * the same registry the app uses. This keeps hermetic E2E users consented
 * when a required policy version is intentionally bumped.
 */
export function currentRequiredLegalAcceptances() {
  return LEGAL_DOCS.filter((doc) => doc.required).map((doc) => ({
    doc_slug: doc.slug,
    version: doc.version,
    last_updated: doc.lastUpdated,
    accepted_at: "2026-01-01T00:00:00Z",
  }));
}
