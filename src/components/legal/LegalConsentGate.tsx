import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  getOutstandingConsents,
  recordAcceptances,
} from "@/lib/legalAcceptance";
import { type LegalDoc } from "@/lib/legalDocs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ScrollText, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { toFriendlyMessage, logRawError } from "@/lib/settingsSecurityErrors";

/**
 * Sits inside the authenticated app. If the signed-in user has not accepted
 * the CURRENT version of any required policy (Terms, Privacy, Community,
 * CSAE), shows a blocking modal until they re-consent.
 *
 * FAIL CLOSED: if we cannot verify consent status (network error, RPC error,
 * RLS refusal), we block the app with a Retry surface rather than silently
 * letting the user in without legal cover.
 */
export default function LegalConsentGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [outstanding, setOutstanding] = useState<LegalDoc[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setOutstanding(null); setLoadError(false); return; }
    setLoadError(false);
    setOutstanding(null);
    try {
      const docs = await getOutstandingConsents(user.id);
      setOutstanding(docs);
    } catch (e) {
      logRawError(e, "legal");
      setLoadError(true);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (!user) return <>{children}</>;

  // FAIL CLOSED: we couldn't confirm consent status.
  if (loadError) {
    return (
      <div className="fixed inset-0 z-[120] bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm royal-card p-5 space-y-4 text-center">
          <div className="flex items-center justify-center gap-2 text-amber-500">
            <AlertTriangle size={18} />
            <h2 className="font-display text-lg">Can't verify policies</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            We couldn't confirm your accepted policy versions. For your safety we've paused the app until we can check again.
          </p>
          <Button onClick={load} className="w-full">Retry</Button>
        </div>
      </div>
    );
  }

  // Still checking, or nothing outstanding — allow through only once we know.
  if (outstanding === null) {
    return (
      <div className="fixed inset-0 z-[120] bg-background flex items-center justify-center p-4">
        <Loader2 className="size-6 animate-spin opacity-60" />
      </div>
    );
  }

  if (outstanding.length === 0) return <>{children}</>;

  const allOk = outstanding.every((d) => checked[d.slug]);

  const accept = async () => {
    if (!allOk || !user) return;
    setBusy(true);
    try {
      await recordAcceptances(user.id, outstanding.map((d) => d.slug), "consent_refresh");
      toast.success("Thanks — your acceptance is on file.");
      setOutstanding([]);
    } catch (e) {
      logRawError(e, "legal");
      toast.error(toFriendlyMessage(e, "legal"));
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

