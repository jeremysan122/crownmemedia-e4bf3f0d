// Preferences page — only settings that are enforced by the current web app
// are exposed here. A stored value is not a product feature by itself: new
// controls must not be added until every consuming surface honors them.

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, CATEGORY_LABEL, CrownCategory } from "@/lib/crown";
import { toast } from "sonner";
import { toFriendlyMessage, logRawError } from "@/lib/settingsSecurityErrors";
import { Link } from "react-router-dom";
import { ChevronRight, Image as ImageIcon, Eye, Lock, Trash2, Info, KeyRound } from "lucide-react";

type Prefs = {
  default_category: string | null;
  reduce_motion: boolean;
  larger_text: boolean;
  high_contrast: boolean;
  sensitive_content_mode: "blur" | "show" | "hide";
};

const VERSION = (import.meta as any).env?.VITE_APP_VERSION ?? "dev";

export default function Preferences() {
  const { profile, refreshProfile } = useAuth();
  const [p, setP] = useState<Prefs | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .rpc("get_my_profile")
      .maybeSingle()
      .then(({ data }) => data && setP(data as unknown as Prefs));
  }, [profile?.id]);

  const save = async (patch: Partial<Prefs>) => {
    if (!profile?.id || !p) return;
    const prev = p;
    const next = { ...p, ...patch };
    setP(next);
    const { error } = await supabase.rpc("update_my_preferences", { _prefs: patch as never });
    if (error) {
      setP(prev);
      logRawError(error, "settings", { patchKeys: Object.keys(patch) });
      toast.error(toFriendlyMessage(error, "settings"));
      return;
    }
    await refreshProfile();
  };

  if (!p) {
    return (
      <AppShell title="PREFERENCES">
        <div className="px-4 py-6 text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  const Section = ({ title, children, icon: Icon }: { title: string; children: React.ReactNode; icon: any }) => (
    <section className="royal-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-gold" />
        <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );

  const Row = ({ title, hint, children }: { title: React.ReactNode; hint?: string; children: React.ReactNode }) => (
    <div className="flex items-center gap-3 py-1.5">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  );

  return (
    <AppShell title="PREFERENCES">
      <div className="px-4 py-4 space-y-5">
        <h1 className="font-display text-2xl text-gold">Preferences</h1>

        {/* Default post settings */}
        <Section title="Default post settings" icon={ImageIcon}>
          <Row title="Default category" hint="Preselects this category when you create a post or Scroll.">
            <Select value={p.default_category ?? "none"} onValueChange={(v) => save({ default_category: v === "none" ? null : v })}>
              <SelectTrigger className="w-40 h-9"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No default</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c as CrownCategory]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>
        </Section>

        {/* Content filters */}
        <Section title="Content filters" icon={Eye}>
          <Link to="/muted-words" className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-lg hover:bg-muted/30">
            <div className="flex-1">
              <div className="text-sm font-semibold">Muted words</div>
              <div className="text-[11px] text-muted-foreground">Hide posts and comments containing these words.</div>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </Link>
          <Link to="/restricted" className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-lg hover:bg-muted/30">
            <div className="flex-1">
              <div className="text-sm font-semibold">Restricted accounts</div>
              <div className="text-[11px] text-muted-foreground">Limit reach without blocking — they won't know.</div>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </Link>
          <Row title="Sensitive content" hint="How posts marked as sensitive are shown to you.">
            <Select value={p.sensitive_content_mode ?? "blur"} onValueChange={(v) => save({ sensitive_content_mode: v as Prefs["sensitive_content_mode"] })}>
              <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="blur">Blur</SelectItem>
                <SelectItem value="show">Show</SelectItem>
                <SelectItem value="hide">Hide</SelectItem>
              </SelectContent>
            </Select>
          </Row>
        </Section>

        {/* Accessibility */}
        <Section title="Accessibility" icon={Eye}>
          <Row title="Reduce motion" hint="Minimizes animations across the app.">
            <Switch checked={p.reduce_motion} onCheckedChange={(v) => save({ reduce_motion: v })} />
          </Row>
          <Row title="Larger text" hint="Bumps base font size by ~12%.">
            <Switch checked={p.larger_text} onCheckedChange={(v) => save({ larger_text: v })} />
          </Row>
          <Row title="High contrast" hint="Stronger text/background contrast.">
            <Switch checked={p.high_contrast} onCheckedChange={(v) => save({ high_contrast: v })} />
          </Row>
        </Section>

        {/* Security */}
        <ChangePasswordSection />

        {/* Storage */}
        <Section title="Storage" icon={Trash2}>
          <Row title="Clear cached data" hint="Drafts and local previews are kept.">
            <Button size="sm" variant="outline" onClick={async () => {
              try {
                const keep = new Set(["crownme:feed:tab", "crownme:feed:tag"]);
                Object.keys(localStorage).forEach((k) => { if (!keep.has(k) && !k.startsWith("crownme:draft")) localStorage.removeItem(k); });
                if (typeof caches !== "undefined") {
                  const names = await caches.keys();
                  await Promise.all(names.map((n) => caches.delete(n)));
                }
                toast.success("Cache cleared");
              } catch (e) {
                logRawError(e, "settings");
                toast.error("Couldn't clear cache. Try again.");
              }
            }}>Clear</Button>
          </Row>
        </Section>

        {/* About */}
        <Section title="About" icon={Info}>
          <Row title="App version"><span className="text-xs tabular-nums text-muted-foreground">{VERSION}</span></Row>
          <Link to="/legal" className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-lg hover:bg-muted/30">
            <Lock size={16} className="text-muted-foreground" />
            <span className="flex-1 text-sm">Legal Center</span>
            <ChevronRight size={16} className="text-muted-foreground" />
          </Link>
        </Section>
      </div>
    </AppShell>
  );
}

function ChangePasswordSection() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (pw.length < 8) { toast.error("Password must be at least 8 characters."); return; }
    if (pw !== pw2) { toast.error("Passwords don't match."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { logRawError(error, "password"); toast.error(toFriendlyMessage(error, "password")); return; }
    setPw(""); setPw2("");
    toast.success("Password updated");
  };
  return (
    <section className="royal-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound size={16} className="text-gold" />
        <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">Change password</h2>
      </div>
      <Input type="password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} className="bg-input h-9" autoComplete="new-password" />
      <Input type="password" placeholder="Confirm new password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="bg-input h-9" autoComplete="new-password" />
      <Button onClick={submit} disabled={busy || !pw} className="w-full">
        {busy ? "Updating…" : "Update password"}
      </Button>
    </section>
  );
}
