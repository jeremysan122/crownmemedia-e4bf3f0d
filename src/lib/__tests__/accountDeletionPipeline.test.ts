import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260717090000_account_deletion_pipeline.sql"),
  "utf8",
);
const worker = readFileSync(
  join(process.cwd(), "supabase/functions/process-account-deletions/index.ts"),
  "utf8",
);

describe("account deletion pipeline contracts", () => {
  it("keeps the cancellation window at 30 days and rejects late cancellation", () => {
    expect(migration).toContain("v_at + interval '30 days'");
    expect(migration).toContain("AND execute_after > now()");
    expect(migration).toContain("Deletion grace period has expired");
  });

  it("claims jobs with skip-locked and retries abandoned workers", () => {
    expect(migration).toContain("FOR UPDATE OF j SKIP LOCKED");
    expect(migration).toContain("j.started_at < now() - interval '20 minutes'");
  });

  it("removes Storage before anonymization and Auth deletion", () => {
    const storageIndex = worker.indexOf("await removeStorage(job)");
    const prepareIndex = worker.indexOf('rpc("prepare_account_for_permanent_deletion"');
    const authIndex = worker.indexOf("admin.auth.admin.deleteUser");
    expect(storageIndex).toBeGreaterThan(-1);
    expect(prepareIndex).toBeGreaterThan(storageIndex);
    expect(authIndex).toBeGreaterThan(prepareIndex);
  });

  it("keeps privileged worker procedures service-role only", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.claim_due_account_deletions[\s\S]*FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.complete_account_deletion_job[\s\S]*TO service_role/,
    );
  });
});
