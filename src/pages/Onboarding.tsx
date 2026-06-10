import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Upload, Bell, UserPlus, ArrowRight, Check } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";

type Step = "avatar" | "follows" | "notifications";
const STEPS: Step[] = ["avatar", "follows", "notifications"];

type Suggested = { id: string; username: string; profile_photo_url: string | null };

export default function Onboarding() {
  useSeoMeta({ title: "Getting Started · CrownMe", noIndex: true });
  const { user, profile, refreshProfile, markOnboarded, onboardingStep, setOnboardingStep } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState<Step>(STEPS[Math.min(onboardingStep, STEPS.length - 1)] ?? "avatar");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.profile_photo_url ?? null);
  const [suggested, setSuggested] = useState<Suggested[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [notifGranted, setNotifGranted] = useState<NotificationPermission | null>(
    typeof Notification !== "undefined" ? Notification.permission : null,
  );

  // When the persisted step loads after mount, jump to it.
  useEffect(() => {
    const target = STEPS[Math.min(onboardingStep, STEPS.length - 1)];
    if (target && target !== step) setStep(target);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingStep]);

  const goNext = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) {
      const nextStep = STEPS[idx + 1];
      setStep(nextStep);
      setOnboardingStep(idx + 1).catch(() => { /* noop */ });
    } else {
      finish();
    }
  };


  const finish = async () => {
    setBusy(true);
    try {
      await markOnboarded();
      toast.success("You're all set");
      // Navigate before refreshing the profile — refreshProfile re-reads
      // profiles_private and a race against replication could momentarily
      // flip needsOnboarding back to true, bouncing us back to step 1.
      nav("/feed", { replace: true });
      refreshProfile().catch(() => { /* noop */ });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't finish setup");
    } finally {
      setBusy(false);
    }
  };

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = data.publicUrl;
      await supabase.from("profiles").update({ profile_photo_url: url }).eq("id", user.id);
      setAvatarUrl(url);
      toast.success("Avatar saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const loadSuggested = async () => {
    if (suggested.length > 0) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, username, profile_photo_url")
      .neq("id", user?.id || "")
      .eq("is_banned", false)
      .order("followers_count", { ascending: false })
      .limit(8);
    setSuggested((data as Suggested[]) || []);
  };

  const toggleFollow = async (id: string) => {
    if (!user) return;
    const next = new Set(following);
    if (next.has(id)) {
      next.delete(id);
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", id);
    } else {
      next.add(id);
      await supabase.from("follows").insert({ follower_id: user.id, following_id: id });
    }
    setFollowing(next);
  };

  const enableNotifications = async () => {
    if (typeof Notification === "undefined") { toast.error("Not supported on this device"); return; }
    const perm = await Notification.requestPermission();
    setNotifGranted(perm);
    if (perm === "granted") toast.success("Notifications enabled");
  };

  // Load suggested users only when the "follows" step becomes active —
  // calling this in the render body triggered a DB fetch on every re-render.
  useEffect(() => {
    if (step === "follows") loadSuggested();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-background/80 flex flex-col items-center px-4 py-10">
      <BrandLogo className="mb-6" />
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-xl p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${
                STEPS.indexOf(step) >= i ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {step === "avatar" && (
          <div className="text-center">
            <Upload className="mx-auto mb-3 text-primary" size={28} />
            <h1 className="text-2xl font-bold mb-2">Add your face</h1>
            <p className="text-muted-foreground mb-6 text-sm">
              Posts with an avatar earn 3× more votes. Upload yours.
            </p>
            <label className="block cursor-pointer">
              <div className="mx-auto h-32 w-32 rounded-full border-2 border-dashed border-primary/40 overflow-hidden bg-muted flex items-center justify-center hover:border-primary transition">
                {avatarUrl ? (
                  <img loading="lazy" src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Upload className="text-muted-foreground" />
                )}
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatar} disabled={uploading} />
              <span className="block text-xs text-muted-foreground mt-3">
                {uploading ? "Uploading…" : "Tap to upload"}
              </span>
            </label>
            <div className="flex gap-2 mt-8">
              <Button variant="ghost" onClick={goNext} className="flex-1">Skip</Button>
              <Button onClick={goNext} className="flex-1" disabled={uploading || !avatarUrl}>
                Continue <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === "follows" && (
          <div>
            <UserPlus className="mx-auto mb-3 text-primary" size={28} />
            <h1 className="text-2xl font-bold mb-2 text-center">Follow some royals</h1>
            <p className="text-muted-foreground mb-5 text-sm text-center">
              Build your feed with creators worth crowning.
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
              {suggested.length === 0 ? (
                <p className="col-span-2 text-center text-muted-foreground text-sm py-8">No suggestions yet.</p>
              ) : (
                suggested.map((s) => {
                  const f = following.has(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleFollow(s.id)}
                      className={`flex items-center gap-2 p-2 rounded-lg border transition ${
                        f ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                      }`}
                    >
                      <div className="h-10 w-10 rounded-full bg-muted overflow-hidden shrink-0">
                        {s.profile_photo_url && (
                          <img loading="lazy" src={s.profile_photo_url} alt="" className="h-full w-full object-cover" />
                        )}
                      </div>
                      <span className="text-sm truncate flex-1 text-left">@{s.username}</span>
                      {f && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex gap-2 mt-6">
              <Button variant="ghost" onClick={goNext} className="flex-1">Skip</Button>
              <Button onClick={goNext} className="flex-1">
                Continue <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === "notifications" && (
          <div className="text-center">
            <Bell className="mx-auto mb-3 text-primary" size={28} />
            <h1 className="text-2xl font-bold mb-2">Stay in the race</h1>
            <p className="text-muted-foreground mb-6 text-sm">
              Get notified when you're crowned, voted, or challenged.
            </p>
            {notifGranted === "granted" ? (
              <div className="text-emerald-500 flex items-center justify-center gap-2 mb-6">
                <Check /> Notifications enabled
              </div>
            ) : (
              <Button onClick={enableNotifications} className="mb-6">
                <Bell className="mr-2 h-4 w-4" /> Enable notifications
              </Button>
            )}
            <Button onClick={finish} className="w-full" disabled={busy}>
              {busy ? <Loader2 className="animate-spin h-4 w-4" /> : "Enter CrownMe"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
