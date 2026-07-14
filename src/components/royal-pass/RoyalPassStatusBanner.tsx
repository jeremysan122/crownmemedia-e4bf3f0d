import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Surface a dunning / payment-failed / disputed banner above the Royal Pass
 * management panel so members with a broken subscription get an obvious
 * retry path instead of silent "Active" text.
 */
export function statusIsDunning(status: string | null | undefined): boolean {
  return status === "past_due" || status === "unpaid" || status === "incomplete";
}

export function statusCopy(status: string | null | undefined): { title: string; body: string } {
  switch (status) {
    case "past_due":
      return {
        title: "Your last payment failed",
        body:
          "Stripe is retrying automatically for a few days. Update your payment method to avoid losing Royal perks.",
      };
    case "unpaid":
      return {
        title: "Payment retries exhausted",
        body:
          "Your Royal Pass is on hold because we couldn't collect payment. Update your card to reactivate right away.",
      };
    case "incomplete":
      return {
        title: "Initial payment didn't complete",
        body:
          "Your first charge didn't finish. Update or confirm your payment method to activate Royal Pass.",
      };
    case "paused":
      return {
        title: "Subscription paused",
        body: "Your Royal Pass is paused. Resume billing to get access back immediately.",
      };
    default:
      return { title: "Payment issue detected", body: "Update billing to restore your Royal Pass." };
  }
}

interface Props {
  status: string | null | undefined;
  onOpenPortal: () => void;
  working: boolean;
}

export default function RoyalPassStatusBanner({ status, onOpenPortal, working }: Props) {
  if (!statusIsDunning(status) && status !== "paused") return null;
  const copy = statusCopy(status);
  return (
    <div
      role="alert"
      data-testid="royal-pass-status-banner"
      className="royal-card p-4 border-2 border-amber-500/50 bg-amber-500/5 space-y-3"
    >
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
          <AlertTriangle size={17} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display text-base text-amber-500 leading-tight">{copy.title}</div>
          <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{copy.body}</p>
        </div>
      </div>
      <Button
        onClick={onOpenPortal}
        disabled={working}
        className="w-full bg-amber-500 hover:bg-amber-500/90 text-primary-foreground"
      >
        {working ? <Loader2 size={14} className="animate-spin mr-2" /> : <ExternalLink size={14} className="mr-2" />}
        Update payment method
      </Button>
    </div>
  );
}
