import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Flag } from "lucide-react";
import { Link } from "react-router-dom";
import EvidenceUpload from "@/components/EvidenceUpload";

const REASONS: { code: string; label: string }[] = [
  { code: "spam", label: "Spam or scam" },
  { code: "harassment", label: "Harassment or hate speech" },
  { code: "nudity", label: "Nudity / sexual content" },
  { code: "violence", label: "Violence or threats" },
  { code: "self_harm", label: "Self-harm" },
  { code: "minor_safety", label: "Child safety / CSAE (urgent)" },
  { code: "ip", label: "Copyright / impersonation" },
  { code: "other", label: "Other" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  postId?: string;
  commentId?: string;
  reportedUserId?: string;
}

export default function ReportDialog({ open, onOpenChange, postId, commentId, reportedUserId }: Props) {
  const { user } = useAuth();
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [evidencePaths, setEvidencePaths] = useState<string[]>([]);

  const submit = async () => {
    setErr(null);
    if (!user?.id) {
      setErr("You must be signed in to submit a report.");
      return;
    }
    if (details.length > 0 && details.trim().length < 10) {
      setErr("Please add at least 10 characters of context, or leave blank.");
      return;
    }
    if (details.length > 1000) {
      setErr("Details must be 1000 characters or fewer.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("reports").insert({
        reporter_id: user.id,
        post_id: postId ?? null,
        comment_id: commentId ?? null,
        reported_user_id: reportedUserId ?? null,
        reason: REASONS.find(r => r.code === reason)?.label ?? reason,
        reason_code: reason,
        mod_notes: details.trim() ? details.trim().slice(0, 1000) : null,
        evidence_paths: evidencePaths,
      });
      if (error) throw error;
      toast.success("Report submitted", {
        description: "Track its status under Settings → My Reports.",
      });
      setDetails("");
      setReason("spam");
      setEvidencePaths([]);
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not submit report";
      setErr(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gold">
            <Flag size={16} /> Report content
          </DialogTitle>
          <DialogDescription>
            Reports are reviewed by our trust &amp; safety team. False reports may result in
            action against your account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Reason</Label>
            <RadioGroup value={reason} onValueChange={setReason} className="mt-2 space-y-1.5">
              {REASONS.map(r => (
                <label key={r.code} className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value={r.code} id={`reason-${r.code}`} />
                  <span>{r.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="rd-details">Details (optional)</Label>
            <Textarea
              id="rd-details"
              value={details}
              onChange={e => setDetails(e.target.value)}
              placeholder="Anything moderators should know…"
              className="bg-input mt-1"
              maxLength={1000}
            />
            <div className="text-right text-[10px] text-muted-foreground tabular-nums">
              {details.length}/1000
            </div>
          </div>

          {user?.id && (
            <EvidenceUpload
              userId={user.id}
              kind="reports"
              paths={evidencePaths}
              onChange={setEvidencePaths}
              disabled={submitting}
            />
          )}

          {err && (
            <p className="text-xs text-destructive" role="alert">
              {err}
            </p>
          )}

          <p className="text-[10px] text-muted-foreground">
            By submitting you confirm this report is made in good faith. See our{" "}
            <Link to="/conduct" className="underline text-primary">Community Guidelines</Link>.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting}
            className="bg-gradient-gold text-primary-foreground"
          >
            {submitting ? "Submitting…" : "Submit report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
