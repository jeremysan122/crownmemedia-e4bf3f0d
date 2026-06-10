import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

export interface ModerationReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Pre-fill the reason textarea. */
  defaultReason?: string;
  /** Confirm-button label. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Destructive styling on the confirm button. */
  destructive?: boolean;
  /** If true, treat the reason field as required (default true). */
  requireReason?: boolean;
  /** Max length on the textarea. Default 500. */
  maxLength?: number;
  /** Called with the trimmed reason. Awaited; dialog stays open on throw. */
  onConfirm: (reason: string) => Promise<void> | void;
}

/**
 * Reusable confirm-with-reason dialog for moderation actions.
 * Replaces window.prompt / window.confirm so notes work in styled UI,
 * are not blocked by enterprise browser policies, and stay testable.
 */
export function ModerationReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  defaultReason = "",
  confirmLabel = "Confirm",
  destructive = false,
  requireReason = true,
  maxLength = 500,
  onConfirm,
}: ModerationReasonDialogProps) {
  const [reason, setReason] = useState(defaultReason);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setReason(defaultReason);
  }, [open, defaultReason]);

  const submit = async () => {
    const trimmed = reason.trim();
    if (requireReason && !trimmed) return;
    setBusy(true);
    try {
      await onConfirm(trimmed);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={requireReason ? "Reason (required)…" : "Reason (optional)…"}
          maxLength={maxLength}
          className="min-h-[100px] text-sm"
          autoFocus
        />
        <p className="text-[10px] text-muted-foreground text-right">
          {reason.length}/{maxLength}
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={submit}
            disabled={busy || (requireReason && !reason.trim())}
          >
            {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
