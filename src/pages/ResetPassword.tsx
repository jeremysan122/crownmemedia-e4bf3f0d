import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BrandLogo from "@/components/BrandLogo";

/**
 * Password reset landing page. Supabase appends a recovery token to the URL
 * hash (`#type=recovery&access_token=...`) which the JS client automatically
 * picks up via `onAuthStateChange("PASSWORD_RECOVERY")`. We then let the user
 * choose a new password and call `updateUser`.
 */
export default function ResetPassword() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // If the hash carries a recovery token, Supabase will fire PASSWORD_RECOVERY.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Also accept users who land here with an existing session (e.g. they
    // already clicked the link and just want to set a new password).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("Passwords don't match");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) return toast.error(error.message);
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
