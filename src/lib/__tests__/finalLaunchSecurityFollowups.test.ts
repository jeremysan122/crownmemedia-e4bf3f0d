import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const analysisWorker = readFileSync(
  join(root, "supabase/functions/analyze-post-media/index.ts"),
  "utf8",
);
const migration = readFileSync(
  join(root, "supabase/migrations/20260718020000_final_launch_security_followups.sql"),
  "utf8",
);
const livekitToken = readFileSync(
  join(root, "supabase/functions/livekit-token/index.ts"),
  "utf8",
);
const royalRuntimeAudit = readFileSync(
  join(root, "supabase/functions/admin-royal-runtime-audit/index.ts"),
  "utf8",
);

describe("final launch security follow-ups", () => {
  it("only forwards CrownMe Storage URLs to the AI vision gateway", () => {
    expect(analysisWorker).toMatch(/function isAllowedStorageUrl/);
    expect(analysisWorker).toMatch(/parsed\.origin !== base\.origin/);
    expect(analysisWorker).toMatch(/storage\\\/v1\\\/object/);
    expect(analysisWorker).toMatch(/hasRejectedUrl/);
    expect(analysisWorker.indexOf("hasRejectedUrl")).toBeLessThan(
      analysisWorker.indexOf('fetch("https://ai.gateway.lovable.dev'),
    );
    expect(analysisWorker).not.toMatch(/\^https\?:\\\/\\\//);
  });

  it("makes the recipient read policy preserve message content itself", () => {
    expect(migration).toMatch(/CREATE POLICY "Recipient can mark read"/);
    expect(migration).toMatch(/WITH CHECK \([\s\S]*auth\.uid\(\) = receiver_id/);
    for (const column of [
      "id", "sender_id", "receiver_id", "body", "shared_post_id", "shared_profile_id",
      "attachment_path", "attachment_name", "attachment_size", "attachment_type", "created_at",
      "kind", "gift_transaction_id", "thread_id",
    ]) {
      expect(migration).toMatch(new RegExp(`\\b${column}\\b[\\s\\S]*old_message\\.${column}`));
    }
  });

  it("removes bulk public vote-history reads and caps the public voter RPC", () => {
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Public voters are visible"/);
    expect(migration).toMatch(/LIMIT LEAST\(GREATEST\(COALESCE\(_limit, 50\), 1\), 50\)/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_post_public_voters\(uuid, int\) TO anon, authenticated/);
  });

  it("turns payment drift and database saturation into deduplicated alerts", () => {
    expect(migration).toMatch(/CREATE TRIGGER admin_alerts_dedupe_db_health/);
    expect(migration).toMatch(/CREATE TRIGGER db_health_snapshot_launch_alerts/);
    expect(migration).toMatch(/Database connections critical/);
    expect(migration).toMatch(/Database deadlock detected/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.evaluate_launch_operational_alerts/);
    expect(migration).toMatch(/processed_at IS NULL/);
    expect(migration).toMatch(/status = 'needs_reconciliation'/);
    expect(migration).toMatch(/'evaluate-launch-ops-5m'/);
    expect(migration).toMatch(/'\*\/5 \* \* \* \*'/);
  });

  it("finalizes async and live battles server-side and rejects expired LiveKit admission", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.finalize_expired_battles/);
    expect(migration).toMatch(/WHERE status = 'active'[\s\S]*ends_at <= now\(\)/);
    expect(migration).toMatch(/FROM public\.live_battles[\s\S]*WHERE status = 'live'[\s\S]*ends_at <= now\(\)/);
    expect(migration).toMatch(/'finalize-expired-battles-1m'/);
    expect(migration).toMatch(/'\* \* \* \* \*'/);
    expect(livekitToken).toMatch(/select\("id, host_id, opponent_id, room_name, status, is_hidden, ends_at"\)/);
    expect(livekitToken).toMatch(/battle\.status === "live"[\s\S]*battle\.ends_at[\s\S]*Date\.now\(\)/);
    expect(livekitToken).toMatch(/rpc\("finalize_expired_battles"\)/);
  });

  it("keeps Royal Pass runtime audits fail-safe and removes synthetic users", () => {
    expect(royalRuntimeAudit).toMatch(/finally \{[\s\S]*royal_pass_debits_paused/);
    expect(royalRuntimeAudit).toMatch(/synthetic_audit_rows/);
    expect(royalRuntimeAudit).toMatch(/_user_id: callerId/);
    expect(royalRuntimeAudit.indexOf("K_purchase_boost_roundtrip")).toBeLessThan(
      royalRuntimeAudit.lastIndexOf('_event_type: finalPassCount === results.length'),
    );
    expect(royalRuntimeAudit).toMatch(/cleanup: \{ ok: cleanupOk, errors: cleanupErrors \}/);
    expect(migration).toMatch(/raw_user_meta_data->>'synthetic' = 'true'/);
    expect(migration.indexOf("DELETE FROM public.royal_pass_grants")).toBeLessThan(
      migration.indexOf("DELETE FROM auth.users"),
    );
    expect(migration.indexOf("DELETE FROM public.royal_shield_audit_log")).toBeLessThan(
      migration.indexOf("DELETE FROM auth.users"),
    );
    expect(migration).toMatch(/DELETE FROM auth\.users WHERE id = synthetic_user\.id/);
  });
});
