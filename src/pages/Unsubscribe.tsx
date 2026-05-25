import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Loader2, MailX, Check, AlertTriangle } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type State = "validating" | "valid" | "used" | "invalid" | "confirming" | "done" | "error";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState<State>("validating");
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    fetch(`${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`, {
      headers: { apikey: SUPABASE_ANON },
    })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.valid) { setEmail(j.email || null); setState("valid"); }
        else if (j.alreadyUnsubscribed || j.used) { setEmail(j.email || null); setState("used"); }
        else { setState("invalid"); setError(j.error || null); }
      })
      .catch(() => setState("error"));
  }, [token]);

  const confirm = async () => {
    setState("confirming");
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/handle-email-unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
        body: JSON.stringify({ token }),
      });
      if (!r.ok) throw new Error("Unsubscribe failed");
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setState("error");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <BrandLogo className="mb-6" />
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 text-center shadow-lg">
        {state === "validating" && <Loader2 className="mx-auto animate-spin text-primary" />}

        {state === "valid" && (
          <>
            <MailX className="mx-auto mb-3 text-primary" size={32} />
            <h1 className="text-xl font-bold mb-2">Unsubscribe?</h1>
            <p className="text-muted-foreground text-sm mb-6">
              We'll stop sending app emails to {email || "this address"}. You can re-enable them in Settings later.
            </p>
            <Button onClick={confirm} className="w-full">Confirm unsubscribe</Button>
          </>
        )}

        {state === "confirming" && <Loader2 className="mx-auto animate-spin text-primary" />}

        {state === "done" && (
          <>
            <Check className="mx-auto mb-3 text-emerald-500" size={32} />
            <h1 className="text-xl font-bold mb-2">You're unsubscribed</h1>
            <p className="text-muted-foreground text-sm mb-6">
              {email || "Your address"} won't receive app emails from CrownMe.
            </p>
            <Link to="/"><Button variant="outline">Back to CrownMe</Button></Link>
          </>
        )}

        {state === "used" && (
          <>
            <Check className="mx-auto mb-3 text-emerald-500" size={32} />
            <h1 className="text-xl font-bold mb-2">Already unsubscribed</h1>
            <p className="text-muted-foreground text-sm">{email || "This address"} is already opted out.</p>
          </>
        )}

        {(state === "invalid" || state === "error") && (
          <>
            <AlertTriangle className="mx-auto mb-3 text-destructive" size={32} />
            <h1 className="text-xl font-bold mb-2">Link unavailable</h1>
            <p className="text-muted-foreground text-sm">{error || "This unsubscribe link is invalid or expired."}</p>
          </>
        )}
      </div>
    </div>
  );
}
