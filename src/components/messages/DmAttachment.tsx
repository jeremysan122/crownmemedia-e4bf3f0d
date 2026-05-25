import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Renders a DM attachment. For images we resolve a short-lived signed URL
 * because the bucket is private. Files are shown as a download link.
 */
export default function DmAttachment({
  path,
  name,
  type,
  size,
}: {
  path: string;
  name?: string | null;
  type?: string | null;
  size?: number | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = !!type && type.startsWith("image/");

  useEffect(() => {
    let cancelled = false;
    supabase.storage.from("dm-attachments").createSignedUrl(path, 60 * 60).then(({ data }) => {
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [path]);

  if (!url) {
    return <div className="text-xs opacity-60 italic">Loading attachment…</div>;
  }
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img loading="lazy" src={url} alt={name ?? "image"} className="max-w-xs max-h-72 rounded-lg object-cover" />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="text-xs underline break-all"
      download={name ?? undefined}
    >
      📎 {name ?? "attachment"} {size ? `(${(size / 1024).toFixed(1)} KB)` : ""}
    </a>
  );
}
