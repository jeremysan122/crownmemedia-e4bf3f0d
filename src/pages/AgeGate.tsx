import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateAge } from "@/lib/crown";
import { ShieldAlert } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { trackEvent } from "@/lib/analytics";
import { useSeoMeta } from "@/hooks/useSeoMeta";

export default function AgeGate() {
  useSeoMeta({ title: "Age Verification · CrownMe", noIndex: true });
  const nav = useNavigate();
  const [confirmed, setConfirmed] = useState(false);
  const [dob, setDob] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { trackEvent("age_gate_viewed"); }, []);

  const proceed = () => {
    setError("");
    if (!dob) return setError("Please enter your date of birth.");
    if (!confirmed) return setError("You must confirm you are 18 or older.");
    if (calculateAge(dob) < 18) {
      trackEvent("age_gate_blocked_underage");
      return setError("You must be at least 18 years old to use CrownMe.");
    }
    trackEvent("age_gate_confirmed");
    sessionStorage.setItem("crownme_dob", dob);
    sessionStorage.setItem("crownme_age_confirmed", "true");
    nav("/auth?mode=signup");
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
        <h1 className="font-display text-2xl text-gold text-center mb-2">Age Verification</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">
          CrownMe is currently for users 18+ only.
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
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => {
                const next = !!v;
                setConfirmed(next);
                trackEvent("age_gate_checkbox_toggled", { metadata: { checked: next } });
              }}
              className="mt-0.5"
            />
            <span className="text-sm leading-snug">I confirm that I am 18 years of age or older.</span>
          </label>

          {error && <p className="text-sm text-destructive text-center">{error}</p>}

          <Button onClick={proceed} className="w-full h-12 bg-gradient-gold text-primary-foreground font-bold tracking-wide gold-shadow">
            Continue
          </Button>
          <button
            onClick={() => nav("/")}
            className="w-full text-sm text-muted-foreground hover:text-foreground"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
