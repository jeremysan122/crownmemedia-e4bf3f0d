import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type StorageRef = { bucket: "media"; path: string };

type PostMediaManifest = {
  image_url?: string | null;
  image_urls?: string[] | null;
  video_url?: string | null;
  video_poster_url?: string | null;
};

type PostMediaRow = {
  storage_bucket?: string | null;
  storage_path?: string | null;
  safe_variant_path?: string | null;
};

export type DeletePostResult = {
  removedObjects: number;
  cleanupDeferred: boolean;
};

/**
 * Convert a public Supabase media URL into an owned storage reference.
 * The user-folder check is deliberately strict so a malformed post can never
 * make the delete flow remove another account's media.
 */
export function ownedMediaRefFromUrl(rawUrl: string | null | undefined, userId: string): StorageRef | null {
  if (!rawUrl || !userId) return null;
  try {
    // URL() normalizes dot segments. Reject them before parsing so a crafted
    // URL cannot be normalized into a different object under the user folder.
    const rawPath = rawUrl.split(/[?#]/, 1)[0].toLowerCase();
    if (rawPath.includes("/../") || rawPath.includes("/./") || rawPath.includes("%2e")) return null;

    const url = new URL(rawUrl);
    const marker = "/storage/v1/object/public/";
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) return null;

    const encodedRef = url.pathname.slice(markerIndex + marker.length);
    const slashIndex = encodedRef.indexOf("/");
    if (slashIndex < 1) return null;

    const bucket = decodeURIComponent(encodedRef.slice(0, slashIndex));
    const path = encodedRef
      .slice(slashIndex + 1)
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");

    if (bucket !== "media" || !path.startsWith(`${userId}/`)) return null;
    return { bucket: "media", path };
  } catch {
    return null;
  }
}

function addOwnedPath(refs: Map<string, StorageRef>, bucket: string | null | undefined, path: string | null | undefined, userId: string) {
  if (bucket !== "media" || !path?.startsWith(`${userId}/`)) return;
  refs.set(`media:${path}`, { bucket: "media", path });
}

/**
 * Delete a post first, then immediately remove its owned Storage objects.
 * If object cleanup fails, the database deletion remains successful and the
 * scheduled orphan cleanup job is the fallback.
 */
export async function deletePostWithMedia(
  client: SupabaseClient<Database>,
  postId: string,
  userId: string,
): Promise<DeletePostResult> {
  const refs = new Map<string, StorageRef>();

  // Capture the media manifest before deleting the post; post_media rows are
  // cascaded with the parent row and would no longer be queryable afterward.
  const [postResult, mediaResult] = await Promise.all([
    client
      .from("posts")
      .select("image_url, image_urls, video_url, video_poster_url")
      .eq("id", postId)
      .eq("user_id", userId)
      .maybeSingle(),
    client
      .from("post_media")
      .select("storage_bucket, storage_path, safe_variant_path")
      .eq("post_id", postId),
  ]);

  if (!postResult?.error && postResult?.data) {
    const post = postResult.data as PostMediaManifest;
    const urls = [
      post.image_url,
      ...(Array.isArray(post.image_urls) ? post.image_urls : []),
      post.video_url,
      post.video_poster_url,
    ];
    for (const rawUrl of urls) {
      const ref = ownedMediaRefFromUrl(rawUrl, userId);
      if (ref) refs.set(`${ref.bucket}:${ref.path}`, ref);
    }
  }

  if (!mediaResult?.error && Array.isArray(mediaResult?.data)) {
    for (const row of mediaResult.data as PostMediaRow[]) {
      addOwnedPath(refs, row.storage_bucket, row.storage_path, userId);
      addOwnedPath(refs, row.storage_bucket, row.safe_variant_path, userId);
    }
  }

  const { error: deleteError } = await client
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("user_id", userId);
  if (deleteError) throw deleteError;

  const paths = [...refs.values()].map((ref) => ref.path);
  if (paths.length === 0) {
    return {
      removedObjects: 0,
      cleanupDeferred: !!postResult?.error || !!mediaResult?.error,
    };
  }

  const { error: storageError } = await client.storage.from("media").remove(paths);
  return {
    removedObjects: storageError ? 0 : paths.length,
    cleanupDeferred: !!storageError,
  };
}
