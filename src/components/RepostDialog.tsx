import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Repeat2, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { cssFor, isValidFilter, type FilterId } from "@/lib/filters";
import {
  checkRepostEligibility,
  createRepost,
  friendlyRepostMessage,
  type RepostEligibility,
} from "@/lib/repost";
import type { FeedPost } from "./PostCard";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  parent: FeedPost;
  /** Fired after a successful (non-replay) repost so parents can bump counts optimistically. */
  onReposted?: (parentPostId: string) => void;
}

/**
 * Repost / quote dialog. All eligibility, category normalization, RLS, blocks,
 * and duplicate prevention are enforced server-side by the `create_repost`
 * Postgres function. The client is intentionally thin and renders only what
 * the server reports.
 */
export default function RepostDialog({ open, onOpenChange, parent, onReposted }: Props) {
  const { user } = useAuth();
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [eligibility, setEligibility] = useState<RepostEligibility | null>(null);
  const [error, setError] = useState<{ code: string; message: string; retryable: boolean } | null>(null);
  // Stable request id per dialog session — guarantees idempotency across
  // retries/double-clicks via the server-side unique index on
  // (actor_user_id, request_id) in repost_attempts_log.
  const requestIdRef = useRef<string>("");

  useEffect(() => {
    if (!open) return;
    requestIdRef.current = crypto.randomUUID();
    setError(null);
    setEligibility(null);
    if (!user) {
      setEligibility({ eligible: false, code: "not_authenticated", reason: friendlyRepostMessage("not_authenticated") });
      return;
    }
    let cancelled = false;
    checkRepostEligibility(parent.id).then((r) => {
      if (!cancelled) setEligibility(r);
    });
    return () => {
      cancelled = true;
    };
  }, [open, parent.id, user]);

  const submit = async () => {
    if (!user || busy) return;
    if (eligibility && !eligibility.eligible) return;
    setBusy(true);
    setError(null);
    const result = await createRepost({
      parentPostId: parent.id,
      caption: caption.trim(),
      requestId: requestIdRef.current,
    });
    setBusy(false);
    if (result.ok) {
      trackEvent("post_reposted", {
        postId: parent.id,
        metadata: { has_caption: caption.length > 0, code: result.code },
      });
      toast.success(result.code === "idempotent_replay" ? "Already reposted" : "Reposted");
      if (result.code !== "idempotent_replay") onReposted?.(parent.id);
      setCaption("");
      onOpenChange(false);
      return;
    }
    setError({
      code: result.code,
      message: friendlyRepostMessage(result.code, result.message),
      retryable: result.retryable,
    });
    // Refresh eligibility for non-retryable terminal states
    if (!result.retryable) {
      checkRepostEligibility(parent.id).then(setEligibility);
    }
  };

  const ineligible = eligibility && !eligibility.eligible;
  const disableSubmit = busy || !user || !!ineligible || (error != null && !error.retryable);
  const checking = eligibility === null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
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
            style={{ filter: cssFor(isValidFilter(parent.filter ?? null) ? (parent.filter as FilterId) : null) }}
            className="size-20 rounded-lg object-cover border border-border shrink-0"
          />
          <div className="flex-1 min-w-0 text-xs">
            <p className="font-semibold">@{parent.profile.username}</p>
            {parent.caption && (
              <p className="text-muted-foreground line-clamp-3">{parent.caption}</p>
            )}
          </div>
        </div>

        {ineligible && (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{eligibility?.reason ?? friendlyRepostMessage(eligibility?.code)}</span>
          </div>
        )}

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error.message}{error.retryable && !/try again/i.test(error.message) ? " You can try again." : ""}</span>
          </div>
        )}

        <Textarea
          placeholder="Add a quote (optional)"
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, 500))}
          maxLength={500}
          rows={3}
          disabled={busy || !!ineligible}
          className="bg-input text-sm"
        />
        <p className="text-[10px] text-muted-foreground -mt-2 text-right tabular-nums">{caption.length}/500</p>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={disableSubmit}
            aria-disabled={disableSubmit}
            className="bg-gradient-gold text-primary-foreground"
          >
            {busy
              ? <><Loader2 size={14} className="animate-spin mr-1" /> Posting…</>
              : checking
                ? <><Loader2 size={14} className="animate-spin mr-1" /> Checking…</>
                : "Repost"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
