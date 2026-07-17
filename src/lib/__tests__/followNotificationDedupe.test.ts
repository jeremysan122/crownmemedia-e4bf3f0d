import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("follow notification ownership", () => {
  it("keeps the follower-count trigger free of notification inserts", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260717123000_dedupe_follow_notifications.sql",
      ),
      "utf8",
    );

    const functionBody = migration.match(
      /CREATE OR REPLACE FUNCTION public\.trg_follow_counts\(\)([\s\S]*?)COMMENT ON FUNCTION/,
    )?.[1];

    expect(functionBody).toBeTruthy();
    expect(functionBody).toContain("followers_count = followers_count + 1");
    expect(functionBody).toContain("following_count = following_count + 1");
    expect(functionBody).not.toMatch(/INSERT\s+INTO\s+public\.notifications/i);
  });
});
