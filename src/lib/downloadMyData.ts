// Generates a ZIP bundle of the signed-in user's data (GDPR-style export).
// Contents:
//   - profile.json          (public profile row, settings, wallet snapshot)
//   - posts.json            (your posts)
//   - comments.json         (comments you've authored)
//   - votes.json            (your reactions)
//   - messages.json         (DMs sent/received)
//   - gifts_sent.json
//   - gifts_received.json
//   - shekel_ledger.json    (wallet activity)
//   - media_manifest.json   (signed URLs to your uploaded media — valid for 1 hour)
//   - README.txt
//
// Runs entirely client-side using the signed-in user's Supabase session, so
// RLS naturally restricts every query to data the user is allowed to see.
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";

const SIGNED_URL_TTL = 60 * 60; // 1 hour

async function safeSelect<T = unknown>(builder: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await builder;
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

export async function downloadMyData(userId: string, username?: string | null): Promise<void> {
  const zip = new JSZip();

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
    safeSelect(supabase.from("profiles").select("*").eq("id", userId) as any),
    safeSelect(supabase.from("posts").select("*").eq("user_id", userId) as any),
    safeSelect(supabase.from("comments").select("*").eq("user_id", userId) as any),
    safeSelect(supabase.from("votes").select("*").eq("user_id", userId) as any),
    safeSelect(supabase.from("messages").select("*").eq("sender_id", userId) as any),
    safeSelect(supabase.from("messages").select("*").eq("receiver_id", userId) as any),
    safeSelect(supabase.from("gift_transactions").select("*").eq("sender_id", userId) as any),
    safeSelect(supabase.from("gift_transactions").select("*").eq("receiver_id", userId) as any),
    safeSelect(supabase.from("shekel_ledger").select("*").eq("user_id", userId) as any),
    safeSelect(supabase.from("wallets").select("*").eq("user_id", userId) as any),
  ]);

  // Collect media references from posts + messages
  type MediaRef = { source: string; bucket: string; path: string; signed_url?: string | null };
  const media: MediaRef[] = [];
  const pushMedia = (source: string, bucket: string, path?: string | null) => {
    if (!path) return;
    media.push({ source, bucket, path });
  };

  for (const p of posts as any[]) {
    pushMedia("post.image", "posts", p?.image_url ?? null);
    pushMedia("post.video", "posts", p?.video_url ?? null);
  }
  for (const m of [...(sentMessages as any[]), ...(receivedMessages as any[])]) {
    pushMedia("message.attachment", "dm-attachments", m?.attachment_path ?? null);
  }

  // Sign URLs in parallel; ignore individual failures.
  await Promise.all(
    media.map(async (m) => {
      try {
        const { data } = await supabase.storage.from(m.bucket).createSignedUrl(m.path, SIGNED_URL_TTL);
        m.signed_url = data?.signedUrl ?? null;
      } catch {
        m.signed_url = null;
      }
    }),
  );

  zip.file("README.txt",
    `CrownMe data export\n` +
    `Generated: ${new Date().toISOString()}\n` +
    `User: @${username ?? "unknown"} (${userId})\n\n` +
    `media_manifest.json contains signed download links to your uploaded\n` +
    `photos/videos and DM attachments. These links expire 1 hour after this\n` +
    `export was generated — re-export to refresh them.\n`,
  );
  zip.file("profile.json", JSON.stringify(profile, null, 2));
  zip.file("wallet.json", JSON.stringify(wallet, null, 2));
  zip.file("posts.json", JSON.stringify(posts, null, 2));
  zip.file("comments.json", JSON.stringify(comments, null, 2));
  zip.file("votes.json", JSON.stringify(votes, null, 2));
  zip.file("messages.json", JSON.stringify({ sent: sentMessages, received: receivedMessages }, null, 2));
  zip.file("gifts_sent.json", JSON.stringify(giftsSent, null, 2));
  zip.file("gifts_received.json", JSON.stringify(giftsReceived, null, 2));
  zip.file("shekel_ledger.json", JSON.stringify(ledger, null, 2));
  zip.file("media_manifest.json", JSON.stringify(media, null, 2));

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `crownme-data-${(username ?? userId).replace(/[^a-z0-9_-]/gi, "_")}-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
