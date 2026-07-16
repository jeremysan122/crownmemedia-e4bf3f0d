import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// Contract tests for the server-side upload validation migration.
// If someone drops a trigger or loosens the limits, these fail.

const MIG_DIR = "supabase/migrations";
const migrationSource = (() => {
  const files = readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return files
    .map((f) => readFileSync(path.join(MIG_DIR, f), "utf8"))
    .join("\n");
})();

describe("server-side upload validation triggers", () => {
  it("post_media trigger enforces image mimes + 50 MB", () => {
    expect(migrationSource).toMatch(/validate_post_media_upload/);
    expect(migrationSource).toMatch(/trg_validate_post_media_upload/);
    expect(migrationSource).toMatch(/'image\/jpeg','image\/png','image\/webp'/);
    expect(migrationSource).toMatch(/50 \* 1024 \* 1024/);
  });

  it("post_media trigger enforces video mimes + 250 MB", () => {
    expect(migrationSource).toMatch(/'video\/mp4','video\/quicktime','video\/webm'/);
    expect(migrationSource).toMatch(/250 \* 1024 \* 1024/);
  });

  it("dm attachment trigger is image-only ≤ 25 MB", () => {
    expect(migrationSource).toMatch(/validate_dm_attachment_upload/);
    expect(migrationSource).toMatch(/trg_validate_dm_attachment_upload/);
    expect(migrationSource).toMatch(/25 \* 1024 \* 1024/);
  });

  it("verification docs trigger allows image + pdf ≤ 25 MB", () => {
    expect(migrationSource).toMatch(/validate_verification_docs/);
    expect(migrationSource).toMatch(/trg_validate_verification_docs/);
    expect(migrationSource).toMatch(/application\/pdf/);
  });

  it("profile avatar/banner trigger enforces 5 MB image-only", () => {
    expect(migrationSource).toMatch(/validate_profile_media_upload/);
    expect(migrationSource).toMatch(/trg_validate_profile_media_upload/);
    expect(migrationSource).toMatch(/5 \* 1024 \* 1024/);
  });

  it("monitoring events are wired to error_logs", () => {
    for (const evt of [
      "upload_validation_failed",
      "video_upload_failed",
      "dm_attachment_upload_failed",
      "verification_doc_upload_failed",
    ]) {
      expect(migrationSource).toContain(evt);
    }
    expect(migrationSource).toMatch(/log_upload_monitoring_event/);
  });

  it("Platform Health surfaces the new failure events", async () => {
    const src = readFileSync("src/lib/platformHealthQueries.ts", "utf8");
    for (const evt of [
      "upload_validation_failed",
      "storage_upload_failed",
      "video_upload_failed",
      "dm_attachment_upload_failed",
      "verification_doc_upload_failed",
    ]) {
      expect(src).toContain(evt);
    }
  });
});
