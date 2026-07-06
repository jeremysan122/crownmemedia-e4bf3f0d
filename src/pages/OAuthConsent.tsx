import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { useSeoMeta } from "@/hooks/useSeoMeta";

type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};

// Beta namespace typed locally.
const oauthApi = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export default function OAuthConsent() {
  useSeoMeta({ title: "Authorize app · CrownMe", noIndex: true });
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?mode=login&next=" + encodeURIComponent(next);
        return;
      }
      if (!oauthApi?.getAuthorizationDetails) {
        setError("OAuth is not available in this build. Please update the app.");
        return;
      }
      const { data, error } = await oauthApi.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message ?? "Could not load this authorization request.");
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    if (!oauthApi) return;
    setBusy(true);
    const { data, error } = approve
      ? await oauthApi.approveAuthorization(authorizationId)
      : await oauthApi.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message ?? "Something went wrong.");
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-background">
        <div className="max-w-md w-full royal-card p-6 space-y-3 text-center">
          <BrandLogo className="mx-auto" />
          <h1 className="font-display text-xl text-gold">Authorization error</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </main>
    );
  }

  if (!details) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-gold" size={28} />
      </main>
    );
  }

  const clientName = details.client?.name ?? "an external app";
  const scopes: string[] = Array.isArray(details.scopes) ? details.scopes : [];

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8 bg-background">
      <div className="max-w-md w-full royal-card p-6 space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandLogo />
          <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center">
            <ShieldCheck className="text-primary" size={22} />
          </div>
          <h1 className="font-display text-xl text-gold">Connect {clientName} to CrownMe</h1>
          <p className="text-sm text-muted-foreground">
            {clientName} is requesting access to use CrownMe as you. You can revoke access at any
            time from your account settings.
          </p>
        </div>

        {scopes.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Requested access
            </div>
            <ul className="text-sm space-y-1 list-disc list-inside">
              {scopes.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" disabled={busy} onClick={() => decide(false)}>
            Deny
          </Button>
          <Button disabled={busy} onClick={() => decide(true)}>
            {busy ? <Loader2 className="animate-spin" size={16} /> : "Approve"}
          </Button>
        </div>
      </div>
    </main>
  );
}
