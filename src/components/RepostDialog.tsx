import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Repeat2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { cssFor, isValidFilter, type FilterId } from "@/lib/filters";
import type { FeedPost } from "./PostCard";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  parent: FeedPost;
}

/**
 * Repost / quote dialog. Creates a new post owned by the current user that
 * references the parent via `parent_post_id` and copies the media so the feed
 * row can render it without an extra fetch.
 */
export default function RepostDialog({ open, onOpenChange, parent }: Props) {
  const { user } = useAuth();
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user) return;
    if (parent.user_id === user.id) {
      toast.error("You can't repost your own post.");
      return;
    }
    setBusy(true);
    try {
      // Fetch the parent's category slugs + filter metadata so the repost row
      // satisfies the posts validation trigger (main_category_slug +
      // subcategory_slug are required) and preserves the original filter.
      const { data: parentRow, error: parentErr } = await supabase
        .from("posts")
        .select("main_category_slug, subcategory_slug, photo_filter, video_filter, filter_type, filter, media_width, media_height, hashtags, content_type")
        .eq("id", parent.id)
        .maybeSingle();
      if (parentErr) throw parentErr;
      if (!parentRow?.main_category_slug || !parentRow?.subcategory_slug) {
        toast.error("This post is missing a category and can't be reposted yet.");
        setBusy(false);
        return;
      }

      const { error } = await supabase.from("posts").insert({
        user_id: user.id,
        parent_post_id: parent.id,
        repost_caption: caption.trim().slice(0, 500),
        // Repost surfaces the original media on the feed card. We carry just
        // enough columns to satisfy validation + render.
        image_url: parent.image_url,
        image_urls: parent.image_urls ?? [parent.image_url],
        media_type: parent.media_type ?? "image",
        video_url: parent.video_url ?? null,
        video_poster_url: parent.video_poster_url ?? null,
        caption: "",
        category: parent.category,
        city: parent.city ?? "",
        state: parent.state ?? "",
        country: parent.country ?? "",
        media_width: parentRow.media_width ?? 1080,
        media_height: parentRow.media_height ?? 1080,
        main_category_slug: parentRow.main_category_slug,
        subcategory_slug: parentRow.subcategory_slug,
        photo_filter: parentRow.photo_filter ?? null,
        video_filter: parentRow.video_filter ?? null,
        filter_type: parentRow.filter_type ?? null,
        filter: parentRow.filter ?? parent.filter ?? null,
        hashtags: parentRow.hashtags ?? null,
        content_type: parentRow.content_type ?? null,
      } as any);
      if (error) throw error;
      trackEvent("post_reposted", { postId: parent.id, metadata: { has_caption: caption.length > 0 } });
      toast.success("Reposted");
      setCaption("");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't repost");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat2 size={18} className="text-primary" /> Repost
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-3">
          <img
            src={parent.image_url}
            alt=""
            className="size-20 rounded-lg object-cover border border-border shrink-0"
          />
          <div className="flex-1 min-w-0 text-xs">
            <p className="font-semibold">@{parent.profile.username}</p>
            {parent.caption && (
              <p className="text-muted-foreground line-clamp-3">{parent.caption}</p>
            )}
          </div>
        </div>
        <Textarea
          placeholder="Add a quote (optional)"
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, 500))}
          maxLength={500}
          rows={3}
          className="bg-input text-sm"
        />
        <p className="text-[10px] text-muted-foreground -mt-2 text-right tabular-nums">{caption.length}/500</p>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={busy} className="bg-gradient-gold text-primary-foreground">
            {busy ? <><Loader2 size={14} className="animate-spin mr-1" /> Posting…</> : "Repost"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
