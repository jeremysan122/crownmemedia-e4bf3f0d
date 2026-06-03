import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  getOutstandingConsents,
  recordAcceptances,
} from "@/lib/legalAcceptance";
import { type LegalDoc } from "@/lib/legalDocs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ScrollText } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

/**
 * Sits inside the authenticated app. If the signed-in user has not accepted
 * the CURRENT version of any required policy (Terms, Privacy, Community,
 * CSAE), shows a blocking modal until they re-consent.
 */
export default function LegalConsentGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [outstanding, setOutstanding] = useState<LegalDoc[] | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) { setOutstanding(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const docs = await getOutstandingConsents(user.id);
        if (!cancelled) setOutstanding(docs);
      } catch {
        if (!cancelled) setOutstanding([]);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!user || !outstanding || outstanding.length === 0) return <>{children}</>;

  const allOk = outstanding.every((d) => checked[d.slug]);

  const accept = async () => {
    if (!allOk || !user) return;
    setBusy(true);
    try {
      await recordAcceptances(user.id, outstanding.map((d) => d.slug), "consent_refresh");
      toast.success("Thanks — your acceptance is on file.");
      setOutstanding([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record acceptance.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {children}
      <div className="fixed inset-0 z-[120] bg-background/90 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-md royal-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-gold">
            <ScrollText size={18} />
            <h2 className="font-display text-lg">Updated policies</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            We've updated the following document{outstanding.length > 1 ? "s" : ""}. Please review and re-accept to continue using CrownMe Media.
          </p>
          <div className="space-y-2">
            {outstanding.map((d) => (
              <label key={d.slug} className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 cursor-pointer">
                <Checkbox
                  checked={!!checked[d.slug]}
                  onCheckedChange={(v) => setChecked((p) => ({ ...p, [d.slug]: !!v }))}
                  className="mt-0.5"
                />
                <span className="text-xs leading-snug">
                  I have read and agree to the updated{" "}
                  <Link to={d.route} target="_blank" className="underline text-primary">{d.label}</Link>
                  <span className="text-muted-foreground"> (v{d.version} · {d.lastUpdated})</span>
                </span>
              </label>
            ))}
          </div>
          <Button onClick={accept} disabled={!allOk || busy} className="w-full">
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Accept & continue"}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            Your acceptance is timestamped and stored as part of your account record.
          </p>
        </div>
      </div>
    </>
  );
}
