// Generates a ZIP bundle of the signed-in user's data (GDPR-style export).
//
// v1.1: client-side, RLS-scoped, with a manifest that records which sections
// succeeded/failed so the export is never silently partial. A future v2 will
// move this into an authenticated edge function so we can allowlist fields
// server-side and audit-log every export.
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { toFriendlyMessage, logRawError } from "@/lib/settingsSecurityErrors";

const SIGNED_URL_TTL = 5 * 60; // 5 minutes — short enough that links can't be shared long after export.

type SectionResult<T = unknown> = { rows: T[]; ok: boolean; error?: string };
type SectionQuery = PromiseLike<{ data: unknown; error: unknown }>;
const sectionQuery = (builder: unknown): SectionQuery => builder as SectionQuery;

async function safeSection<T = unknown>(
  name: string,
  builder: SectionQuery,
): Promise<SectionResult<T>> {
  try {
    const { data, error } = await builder;
    if (error) return { rows: [], ok: false, error: name };
    return { rows: (Array.isArray(data) ? data : data == null ? [] : [data]) as T[], ok: true };
  } catch {
    return { rows: [], ok: false, error: name };
  }
}

// Sections whose failure means the export is dangerously incomplete.
const CRITICAL_SECTIONS = new Set([
  "profile",
  "private_profile",
  "posts",
  "legal_acceptances",
  "payment_transactions",
]);

// Column allowlist for posts — trimmed to the owner-safe subset. We
// intentionally exclude moderation flags (moderation_status, is_removed
// audit fields) and denormalized ranking metrics that would trip
// column-permission errors on RLS-scoped columns.
const POST_COLS =
  "id,user_id,image_url,caption,category,city,state,country," +
  "vote_count,comment_count,share_count,battle_wins,created_at," +
  "image_urls,media_type,video_url,video_poster_url,duration_ms," +
  "media_width,media_height,is_archived,archived_at,hashtags," +
  "edited_at,pinned_at,scheduled_for,parent_post_id,repost_caption," +
  "is_sensitive,main_category_slug,subcategory_slug,publish_status,content_type";

export class ExportError extends Error {
  failedSections: string[];
  constructor(message: string, failedSections: string[]) {
    super(message);
    this.name = "ExportError";
    this.failedSections = failedSections;
  }
}

export async function downloadMyData(userId: string, username?: string | null): Promise<void> {
  const zip = new JSZip();
  const startedAt = new Date().toISOString();

  const [
    profile,
    posts,
    comments,
    votes,
    sentMessages,
    receivedMessages,
    giftsSent,
    giftsReceived,
    ledger,
    wallet,
    privateProfile,
    legalAcceptances,
    blocks,
    bookmarks,
    notifications,
    royalPass,
    paymentTransactions,
    payouts,
    verificationRequests,
    reportsFiled,
    reportAppeals,
    sensitiveAppeals,
    drafts,
    mutedWords,
    restrictedUsers,
  ] = await Promise.all([
    safeSection("profile", sectionQuery(supabase.rpc("get_my_profile"))),
    safeSection("posts", sectionQuery(supabase.from("posts").select(POST_COLS).eq("user_id", userId))),
    safeSection("comments", sectionQuery(supabase.from("comments").select("*").eq("user_id", userId))),
    safeSection("votes", sectionQuery(supabase.from("votes").select("*").eq("user_id", userId))),
    safeSection("messages_sent", sectionQuery(supabase.from("messages").select("*").eq("sender_id", userId))),
    safeSection("messages_received", sectionQuery(supabase.from("messages").select("*").eq("receiver_id", userId))),
    safeSection("gifts_sent", sectionQuery(supabase.from("gift_transactions").select("*").eq("sender_id", userId))),
    safeSection("gifts_received", sectionQuery(supabase.from("gift_transactions").select("*").eq("receiver_id", userId))),
    safeSection("shekel_ledger", sectionQuery(supabase.from("shekel_ledger").select("*").eq("user_id", userId))),
    safeSection("wallet", sectionQuery(supabase.from("wallets").select("*").eq("user_id", userId))),
    safeSection("private_profile", sectionQuery(supabase.from("profiles_private").select("*").eq("id", userId))),
    safeSection("legal_acceptances", sectionQuery(supabase.from("user_legal_acceptances").select("*").eq("user_id", userId))),
    safeSection("blocks", sectionQuery(supabase.from("blocks").select("*").eq("blocker_id", userId))),
    safeSection("bookmarks", sectionQuery(supabase.from("post_bookmarks").select("*").eq("user_id", userId))),
    safeSection("notifications", sectionQuery(supabase.from("notifications").select("*").eq("user_id", userId))),
    safeSection("royal_pass", sectionQuery(supabase.from("royal_pass_subscriptions").select("*").eq("user_id", userId))),
    safeSection("payment_transactions", sectionQuery(supabase.from("payment_transactions").select("*").eq("user_id", userId))),
    safeSection("payouts", sectionQuery(supabase.from("payouts").select("*").eq("user_id", userId))),
    safeSection("verification_requests", sectionQuery(supabase.from("verification_requests").select("*").eq("user_id", userId))),
    safeSection("reports_filed", sectionQuery(supabase.from("reports").select("*").eq("reporter_id", userId))),
    safeSection("report_appeals", sectionQuery(supabase.from("report_appeals").select("*").eq("user_id", userId))),
    safeSection("sensitive_appeals", sectionQuery(supabase.from("sensitive_appeals").select("*").eq("user_id", userId))),
    safeSection("drafts", sectionQuery(supabase.from("post_drafts").select("*").eq("user_id", userId))),
    safeSection("muted_words", sectionQuery(supabase.from("muted_words").select("*").eq("user_id", userId))),
    safeSection("restricted_users", sectionQuery(supabase.from("restricted_users").select("*").eq("user_id", userId))),
  ]);

  const allSections: Array<{ name: string; result: SectionResult }> = [
    { name: "profile", result: profile },
    { name: "posts", result: posts },
    { name: "comments", result: comments },
    { name: "votes", result: votes },
    { name: "messages_sent", result: sentMessages },
    { name: "messages_received", result: receivedMessages },
    { name: "gifts_sent", result: giftsSent },
    { name: "gifts_received", result: giftsReceived },
    { name: "shekel_ledger", result: ledger },
    { name: "wallet", result: wallet },
    { name: "private_profile", result: privateProfile },
    { name: "legal_acceptances", result: legalAcceptances },
    { name: "blocks", result: blocks },
    { name: "bookmarks", result: bookmarks },
    { name: "notifications", result: notifications },
    { name: "royal_pass", result: royalPass },
    { name: "payment_transactions", result: paymentTransactions },
    { name: "payouts", result: payouts },
    { name: "verification_requests", result: verificationRequests },
    { name: "reports_filed", result: reportsFiled },
    { name: "report_appeals", result: reportAppeals },
    { name: "sensitive_appeals", result: sensitiveAppeals },
    { name: "drafts", result: drafts },
    { name: "muted_words", result: mutedWords },
    { name: "restricted_users", result: restrictedUsers },
  ];

  const failedSections = allSections.filter((s) => !s.result.ok).map((s) => s.name);
  const criticalFailures = failedSections.filter((n) => CRITICAL_SECTIONS.has(n));
  if (criticalFailures.length > 0) {
    logRawError(new Error(`Critical export sections failed: ${criticalFailures.join(", ")}`), "export", {
      failedSections,
    });
    throw new ExportError(toFriendlyMessage(null, "export"), failedSections);
  }

  // Collect media references from posts + messages.
  type MediaRef = { source: string; bucket: string; path: string; original_url?: string; signed_url?: string | null; expires_in_seconds?: number };
  const media: MediaRef[] = [];
  const pushMedia = (source: string, fallbackBucket: string, value?: string | null) => {
    if (!value) return;
    try {
      const parsed = new URL(value);
      const match = parsed.pathname.match(/^\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
      if (match) {
        media.push({ source, bucket: decodeURIComponent(match[1]), path: decodeURIComponent(match[2]), original_url: value });
        return;
      }
    } catch { /* value is already a storage path */ }
    media.push({ source, bucket: fallbackBucket, path: value });
  };

  type ExportPost = { image_urls?: unknown; image_url?: string | null; video_url?: string | null };
  type ExportMessage = { attachment_path?: string | null };
  for (const p of posts.rows as ExportPost[]) {
    const images = Array.isArray(p?.image_urls) && p.image_urls.length > 0 ? p.image_urls : [p?.image_url];
    images.forEach((url: string | null, index: number) => pushMedia(`post.image.${index}`, "media", url));
    pushMedia("post.video", "media", p?.video_url ?? null);
  }
  for (const m of [...(sentMessages.rows as ExportMessage[]), ...(receivedMessages.rows as ExportMessage[])]) {
    pushMedia("message.attachment", "dm-attachments", m?.attachment_path ?? null);
  }

  // Sign URLs in parallel; ignore individual failures. Never log the URLs.
  await Promise.all(
    media.map(async (m) => {
      try {
        const { data } = await supabase.storage.from(m.bucket).createSignedUrl(m.path, SIGNED_URL_TTL);
        m.signed_url = data?.signedUrl ?? null;
        m.expires_in_seconds = SIGNED_URL_TTL;
      } catch {
        m.signed_url = null;
      }
    }),
  );

  const manifest = {
    generated_at: startedAt,
    user_id: userId,
    included_sections: allSections.filter((s) => s.result.ok).map((s) => s.name),
    failed_sections: failedSections,
    signed_url_ttl_seconds: SIGNED_URL_TTL,
    version: "1.1",
  };

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("README.txt",
    `CrownMe data export\n` +
    `Generated: ${startedAt}\n` +
    `User: @${username ?? "unknown"} (${userId})\n\n` +
    `See manifest.json for which sections succeeded/failed.\n` +
    `media_manifest.json contains signed download links to your uploaded\n` +
    `photos/videos and DM attachments. These links expire ${Math.round(SIGNED_URL_TTL / 60)} minutes\n` +
    `after this export was generated — re-export to refresh them.\n`,
  );
  zip.file("profile.json", JSON.stringify(profile.rows, null, 2));
  zip.file("wallet.json", JSON.stringify(wallet.rows, null, 2));
  zip.file("private_profile.json", JSON.stringify(privateProfile.rows, null, 2));
  zip.file("legal_acceptances.json", JSON.stringify(legalAcceptances.rows, null, 2));
  zip.file("posts.json", JSON.stringify(posts.rows, null, 2));
  zip.file("comments.json", JSON.stringify(comments.rows, null, 2));
  zip.file("votes.json", JSON.stringify(votes.rows, null, 2));
  zip.file("messages.json", JSON.stringify({ sent: sentMessages.rows, received: receivedMessages.rows }, null, 2));
  zip.file("gifts_sent.json", JSON.stringify(giftsSent.rows, null, 2));
  zip.file("gifts_received.json", JSON.stringify(giftsReceived.rows, null, 2));
  zip.file("shekel_ledger.json", JSON.stringify(ledger.rows, null, 2));
  zip.file("blocks.json", JSON.stringify(blocks.rows, null, 2));
  zip.file("bookmarks.json", JSON.stringify(bookmarks.rows, null, 2));
  zip.file("notifications.json", JSON.stringify(notifications.rows, null, 2));
  zip.file("royal_pass.json", JSON.stringify(royalPass.rows, null, 2));
  zip.file("payment_transactions.json", JSON.stringify(paymentTransactions.rows, null, 2));
  zip.file("payouts.json", JSON.stringify(payouts.rows, null, 2));
  zip.file("verification_requests.json", JSON.stringify(verificationRequests.rows, null, 2));
  zip.file("reports_filed.json", JSON.stringify(reportsFiled.rows, null, 2));
  zip.file("report_appeals.json", JSON.stringify(reportAppeals.rows, null, 2));
  zip.file("sensitive_appeals.json", JSON.stringify(sensitiveAppeals.rows, null, 2));
  zip.file("drafts.json", JSON.stringify(drafts.rows, null, 2));
  zip.file("muted_words.json", JSON.stringify(mutedWords.rows, null, 2));
  zip.file("restricted_users.json", JSON.stringify(restrictedUsers.rows, null, 2));
  zip.file("media_manifest.json", JSON.stringify(media, null, 2));

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `crownme-data-${(username ?? userId).replace(/[^a-z0-9_-]/gi, "_")}-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke synchronously-ish after the browser has grabbed the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
