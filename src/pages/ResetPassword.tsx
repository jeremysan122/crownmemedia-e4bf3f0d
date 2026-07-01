import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BrandLogo from "@/components/BrandLogo";
import { toFriendlyMessage, logRawError } from "@/lib/settingsSecurityErrors";
import { scorePassword } from "@/lib/passwordStrength";

export default function ResetPassword() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Keep in sync with signupValidation.ts: min 8 chars, must score >= 2.
    if (password.length < 8) return toast.error("Password must be at least 8 characters.");
    const score = scorePassword(password).score;
    if (score < 2) return toast.error("Choose a stronger password.");
    if (password !== confirm) return toast.error("Passwords don't match.");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      logRawError(error, "password");
      return toast.error(toFriendlyMessage(error, "password"));
    }
    toast.success("Password updated — you're signed in");
    nav("/feed", { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-10 bg-gradient-royal">
      <BrandLogo size={72} priority glow />
      <div className="mt-8 w-full max-w-sm animate-fade-in">
        <h1 className="font-display text-3xl text-gold mb-1">Reset password</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {ready ? "Choose a new password to continue." : "Verifying your reset link…"}
        </p>
        {ready && (
          <form className="space-y-3" onSubmit={submit}>
            <div>
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 bg-input"
                placeholder="••••••••"
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="h-12 bg-input"
                placeholder="••••••••"
              />
            </div>
            <Button
              type="submit"
              disabled={saving}
              className="w-full h-12 mt-4 bg-gradient-gold text-primary-foreground font-bold tracking-wider gold-shadow"
            >
              {saving ? "Saving…" : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
