// Generates a ZIP bundle of the signed-in user's data (GDPR-style export).
//
// v1.0: client-side, RLS-scoped, with a manifest that records which sections
// succeeded/failed so the export is never silently partial. A future v1.1 will
// move this into an authenticated edge function so we can allowlist fields
// server-side and audit-log every export.
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { toFriendlyMessage, logRawError } from "@/lib/settingsSecurityErrors";

const SIGNED_URL_TTL = 5 * 60; // 5 minutes — short enough that links can't be shared long after export.

type SectionResult<T = unknown> = { rows: T[]; ok: boolean; error?: string };

async function safeSection<T = unknown>(
  name: string,
  builder: PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<SectionResult<T>> {
  try {
    const { data, error } = await builder;
    if (error) return { rows: [], ok: false, error: name };
    return { rows: data ?? [], ok: true };
  } catch {
    return { rows: [], ok: false, error: name };
  }
}

// Sections whose failure means the export is dangerously incomplete.
const CRITICAL_SECTIONS = new Set(["profile", "posts"]);

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
  ] = await Promise.all([
    safeSection("profile", supabase.rpc("get_my_profile") as any),
    safeSection("posts", supabase.from("posts").select(POST_COLS).eq("user_id", userId) as any),
    safeSection("comments", supabase.from("comments").select("*").eq("user_id", userId) as any),
    safeSection("votes", supabase.from("votes").select("*").eq("user_id", userId) as any),
    safeSection("messages_sent", supabase.from("messages").select("*").eq("sender_id", userId) as any),
    safeSection("messages_received", supabase.from("messages").select("*").eq("receiver_id", userId) as any),
    safeSection("gifts_sent", supabase.from("gift_transactions").select("*").eq("sender_id", userId) as any),
    safeSection("gifts_received", supabase.from("gift_transactions").select("*").eq("receiver_id", userId) as any),
    safeSection("shekel_ledger", supabase.from("shekel_ledger").select("*").eq("user_id", userId) as any),
    safeSection("wallet", supabase.from("wallets").select("*").eq("user_id", userId) as any),
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
  type MediaRef = { source: string; bucket: string; path: string; signed_url?: string | null; expires_in_seconds?: number };
  const media: MediaRef[] = [];
  const pushMedia = (source: string, bucket: string, path?: string | null) => {
    if (!path) return;
    media.push({ source, bucket, path });
  };

  for (const p of posts.rows as any[]) {
    pushMedia("post.image", "posts", p?.image_url ?? null);
    pushMedia("post.video", "posts", p?.video_url ?? null);
  }
  for (const m of [...(sentMessages.rows as any[]), ...(receivedMessages.rows as any[])]) {
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
    version: "1.0",
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
  zip.file("posts.json", JSON.stringify(posts.rows, null, 2));
  zip.file("comments.json", JSON.stringify(comments.rows, null, 2));
  zip.file("votes.json", JSON.stringify(votes.rows, null, 2));
  zip.file("messages.json", JSON.stringify({ sent: sentMessages.rows, received: receivedMessages.rows }, null, 2));
  zip.file("gifts_sent.json", JSON.stringify(giftsSent.rows, null, 2));
  zip.file("gifts_received.json", JSON.stringify(giftsReceived.rows, null, 2));
  zip.file("shekel_ledger.json", JSON.stringify(ledger.rows, null, 2));
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
