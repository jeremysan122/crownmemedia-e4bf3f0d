import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Crown, Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function GiftRoyalPassDialog({ open, onOpenChange }: Props) {
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const { openCheckout, checkoutElement } = useStripeCheckout();

  const submit = async () => {
    const clean = username.trim().replace(/^@/, "");
    if (!clean) {
      toast.error("Enter a username");
      return;
    }
    setChecking(true);
    try {
      const { data, error } = await supabase.rpc("resolve_gift_recipient", { _username: clean });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row?.id) {
        toast.error(`@${clean} not found`);
        return;
      }
      onOpenChange(false);
      openCheckout({
        fnName: "create-royal-pass-gift-checkout",
        title: `Gift Royal Pass → @${row.username}`,
        extraBody: {
          recipient_username: clean,
          message: message.trim() || undefined,
        },
        successPath: "/royal-pass?gift_success=1&session_id={SESSION_ID}",
      });
      setUsername("");
      setMessage("");
    } catch (e) {
      toast.error((e as Error).message || "Something went wrong");
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <Gift className="w-5 h-5 text-primary" />
              Gift Royal Pass
            </DialogTitle>
            <DialogDescription>
              Send someone one month of Royal Pass for $9.99. They get every perk instantly.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="gift-recipient">Recipient username</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <Input
                  id="gift-recipient"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  className="pl-7"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gift-message">
                Message <span className="text-muted-foreground text-xs">(optional, 280 chars)</span>
              </Label>
              <Textarea
                id="gift-message"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 280))}
                placeholder="Long may you reign 👑"
                rows={3}
              />
            </div>

            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
              <Crown className="w-5 h-5 text-primary shrink-0" />
              <div className="text-sm">
                <div className="font-medium">Royal Pass · 1 month gift</div>
                <div className="text-muted-foreground">$9.99 — one-time payment</div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={submit} disabled={checking || !username.trim()}>
                {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue to checkout"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {checkoutElement}
    </>
  );
}
