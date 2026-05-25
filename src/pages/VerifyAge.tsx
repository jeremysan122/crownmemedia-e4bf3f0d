import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateAge } from "@/lib/crown";
import { ShieldAlert } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";

/**
 * Post-OAuth age verification. The Auth page already requires email/password
 * users to confirm 18+ before signup; OAuth (Google/Apple) flows skip that
 * step, so any unconfirmed user is routed here before they can use the app.
 *
 * Server-side enforcement: confirm_my_age() rejects DOBs under 18.
 */
export default function VerifyAge() {
  const nav = useNavigate();
  const { user, loading, ageConfirmed, refreshProfile, signOut } = useAuth();
  const [confirmed, setConfirmed] = useState(false);
  const [dob, setDob] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;
  if (ageConfirmed) return <Navigate to="/feed" replace />;

  const submit = async () => {
    setError("");
    if (!dob) return setError("Please enter your date of birth.");
    if (!confirmed) return setError("You must confirm you are 18 or older.");
    if (calculateAge(dob) < 18) {
      trackEvent("age_gate_blocked_underage", { metadata: { source: "verify_age" } });
      return setError("You must be at least 18 years old to use CrownMe.");
    }
    setSubmitting(true);
    try {
      const { error: rpcErr } = await supabase.rpc("confirm_my_age", { _dob: dob });
      if (rpcErr) throw rpcErr;
      trackEvent("age_gate_confirmed", { metadata: { source: "verify_age" } });
      await refreshProfile();
      toast.success("Age verified");
      nav("/feed", { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Verification failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-gradient-royal">
      <BrandLogo size={72} priority glow className="mb-6" />
      <div className="w-full max-w-sm royal-card border-gold p-7 animate-scale-in">
        <div className="flex justify-center mb-5">
          <div className="size-14 rounded-full bg-destructive/15 flex items-center justify-center">
            <ShieldAlert className="text-destructive" size={28} />
          </div>
        </div>
        <h2 className="font-display text-2xl text-gold text-center mb-2">One more step</h2>
        <p className="text-sm text-muted-foreground text-center mb-6">
          CrownMe is for users 18+ only. Please confirm your date of birth to continue.
        </p>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dob">Date of Birth</Label>
            <Input
              id="dob"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="bg-input border-border h-12"
            />
          </div>

          <label className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 cursor-pointer">
            <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} className="mt-0.5" />
            <span className="text-sm leading-snug">I confirm that I am 18 years of age or older.</span>
          </label>

          {error && <p className="text-sm text-destructive text-center">{error}</p>}

          <Button
            onClick={submit}
            disabled={submitting}
            className="w-full h-12 bg-gradient-gold text-primary-foreground font-bold tracking-wide gold-shadow"
          >
            {submitting ? "Verifying…" : "Confirm"}
          </Button>
          <button
            onClick={async () => { await signOut(); nav("/", { replace: true }); }}
            className="w-full text-sm text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
