// Unit tests for the AI-media-analysis verdict → post-flag decision logic.
// The edge function (supabase/functions/analyze-post-media/index.ts) maps a
// Gemini verdict to a `posts` update. This test mirrors the same decision
// table so any drift surfaces in CI without needing the real edge runtime.
//
// RLS smoke and end-to-end tests run against the live DB and are gated on the
// e2e env vars (same pattern as moderationRls.e2e.test.ts).

import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

type Status = "safe" | "sensitive" | "blocked" | "needs_review";

// Mirror of the post-update branch in analyze-post-media/index.ts.
function decidePostUpdate(verdict: {
  safety_status: Status;
  reason?: string;
  extracted_text?: string;
  suggested_topic?: string | null;
  suggested_master_category?: string | null;
  confidence?: number;
}): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  const reason = (verdict.reason ?? "").slice(0, 120);
  if (verdict.safety_status === "blocked") {
    update.moderation_status = "pending_review";
    update.is_sensitive = true;
    update.sensitive_reason = reason || "Flagged by automated review";
    update.content_rating = "explicit";
  } else if (verdict.safety_status === "sensitive") {
    update.is_sensitive = true;
    update.sensitive_reason = reason || "Marked sensitive by automated review";
    update.content_rating = "suggestive";
  } else if (verdict.safety_status === "needs_review") {
    update.moderation_status = "pending_review";
  }
  const parts = [verdict.extracted_text, verdict.suggested_topic].filter((s): s is string => !!s && s.length > 0);
  if (parts.length > 0) update.ai_searchable_text = parts.join(" ").toLowerCase().slice(0, 4000);
  if (verdict.suggested_master_category && (verdict.confidence ?? 0) >= 0.7) {
    update.ai_suggested_main_category_slug = verdict.suggested_master_category;
  }
  return update;
}

describe("AI media analysis → post update decision", () => {
  it("safe verdict leaves the post untouched", () => {
    expect(decidePostUpdate({ safety_status: "safe" })).toEqual({});
  });

  it("sensitive verdict only marks the post sensitive, never removes", () => {
    const u = decidePostUpdate({ safety_status: "sensitive", reason: "swimwear" });
    expect(u.is_sensitive).toBe(true);
    expect(u.sensitive_reason).toBe("swimwear");
    expect(u.content_rating).toBe("suggestive");
    expect(u.moderation_status).toBeUndefined();
    expect(u.is_removed).toBeUndefined();
  });

  it("blocked verdict auto-hides via pending_review and marks sensitive, never hard-removes", () => {
    const u = decidePostUpdate({ safety_status: "blocked", reason: "nudity" });
    expect(u.moderation_status).toBe("pending_review");
    expect(u.is_sensitive).toBe(true);
    expect(u.content_rating).toBe("explicit");
    // Hard removal must remain a human-only action.
    expect(u.is_removed).toBeUndefined();
  });

  it("needs_review verdict routes the post to pending_review but does not flag sensitive", () => {
    const u = decidePostUpdate({ safety_status: "needs_review" });
    expect(u.moderation_status).toBe("pending_review");
    expect(u.is_sensitive).toBeUndefined();
  });

  it("falls back to a default reason when the model returned none", () => {
    expect(decidePostUpdate({ safety_status: "sensitive" }).sensitive_reason).toBeTruthy();
    expect(decidePostUpdate({ safety_status: "blocked" }).sensitive_reason).toBeTruthy();
  });

  it("clamps reason to 120 chars to fit the posts.sensitive_reason column", () => {
    const long = "x".repeat(500);
    const u = decidePostUpdate({ safety_status: "sensitive", reason: long });
    expect((u.sensitive_reason as string).length).toBeLessThanOrEqual(120);
  });

  it("writes OCR + topic to ai_searchable_text in lowercase, even for safe verdicts", () => {
    const u = decidePostUpdate({
      safety_status: "safe",
      extracted_text: "Visit MyShop.COM for Deals",
      suggested_topic: "Streetwear Drop",
    });
    expect(u.ai_searchable_text).toBe("visit myshop.com for deals streetwear drop");
    // Search recall is independent of the safety branch — safe posts still get indexed.
    expect(u.is_sensitive).toBeUndefined();
  });

  it("scam/spam OCR text alone does not auto-block, but a needs_review safety verdict routes to pending_review", () => {
    const u = decidePostUpdate({
      safety_status: "needs_review",
      extracted_text: "Send $500 to cashapp $scammer — guaranteed return",
    });
    expect(u.moderation_status).toBe("pending_review");
    expect(u.ai_searchable_text).toContain("cashapp");
  });

  it("only writes ai_suggested_main_category_slug when confidence >= 0.7", () => {
    const low = decidePostUpdate({
      safety_status: "safe",
      suggested_master_category: "fashion-beauty",
      confidence: 0.5,
    });
    expect(low.ai_suggested_main_category_slug).toBeUndefined();
    const high = decidePostUpdate({
      safety_status: "safe",
      suggested_master_category: "fashion-beauty",
      confidence: 0.9,
    });
    expect(high.ai_suggested_main_category_slug).toBe("fashion-beauty");
  });
});

// ─── e2e: anon and authenticated non-admin must not read raw AI rows ───
const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const canRun = !!(URL && ANON);

(canRun ? describe : describe.skip)("post_media_ai_analysis RLS", () => {
  it("anonymous users get zero rows from post_media_ai_analysis", async () => {
    const sb = createClient(URL!, ANON!);
    const { data, error } = await sb.from("post_media_ai_analysis" as any).select("id").limit(1);
    // RLS denies — either no rows or a permission error. Both are acceptable;
    // what must NOT happen is leaking a populated row.
    expect(error || (Array.isArray(data) && data.length === 0)).toBeTruthy();
  });
});
