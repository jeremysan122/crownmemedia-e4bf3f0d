/**
 * Storage upload helpers with real byte-level progress and bounded concurrency.
 *
 * Why this exists:
 * - Supabase JS `storage.upload()` resolves only at completion — no progress
 *   events. We work around that by asking the server for a signed upload URL
 *   and using XMLHttpRequest, whose `progress` event gives us real bytes.
 * - Sequential photo uploads are painfully slow; this module pools them with
 *   a configurable concurrency cap (default 3) so the UI feels snappy without
 *   saturating the network.
 */
import { supabase } from "@/integrations/supabase/client";

export interface SignedUploadResult {
  path: string;
  publicUrl: string;
}

/**
 * Upload one file to the `media` bucket with real byte progress.
 * Returns the storage path and a public URL.
 */
export async function uploadWithProgress(
  path: string,
  file: Blob,
  opts: {
    contentType?: string;
    signal?: AbortSignal;
    onProgress?: (ratio: number) => void;
  } = {},
): Promise<SignedUploadResult> {
  const { data: signed, error: signErr } = await supabase.storage
    .from("media")
    .createSignedUploadUrl(path, { upsert: true } as { upsert: boolean });
  if (signErr || !signed?.signedUrl) {
    // Fall back to the regular upload — no progress but at least it works.
    const { error: upErr } = await supabase.storage
      .from("media")
      .upload(path, file, {
        upsert: true,
        contentType: opts.contentType,
        cacheControl: "31536000",
      });
    if (upErr) throw upErr;
    opts.onProgress?.(1);
    const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
    return { path, publicUrl: pub.publicUrl };
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signed.signedUrl);
    if (opts.contentType) xhr.setRequestHeader("Content-Type", opts.contentType);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.setRequestHeader("Cache-Control", "max-age=31536000");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) {
        opts.onProgress(Math.min(1, e.loaded / e.total));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText.slice(0, 200)}`));
    };
    if (opts.signal) {
      const onAbort = () => { try { xhr.abort(); } catch { /* noop */ } reject(new Error("__cancelled__")); };
      if (opts.signal.aborted) return onAbort();
      opts.signal.addEventListener("abort", onAbort, { once: true });
    }
    xhr.send(file);
  });

  opts.onProgress?.(1);
  const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
  return { path, publicUrl: pub.publicUrl };
}

/**
 * Run async jobs with a concurrency cap. Preserves index order in the output.
 * If any job throws, the remaining queued jobs run to completion but the first
 * thrown error is rethrown after all settle.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = 3,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  let firstError: unknown = null;
  const next = async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i], i);
      } catch (e) {
        if (!firstError) firstError = e;
      }
    }
  };
  const runners = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, next);
  await Promise.all(runners);
  if (firstError) throw firstError;
  return results;
}
