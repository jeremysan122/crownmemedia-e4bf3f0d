// Preferences page — extended user settings backed by columns on `profiles`.
// Kept as a separate route to avoid bloating Settings.tsx further.
//
// Each section reads & writes a slice of the profile. Saves are optimistic
// with a sonner toast on error. Server-side enforcement of privacy fields
// (who_can_tag/mention/dm, muted words) is TODO — this PR persists the
// preference; readers must consult these fields when surfacing UI.

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CATEGORIES, CATEGORY_LABEL, CrownCategory } from "@/lib/crown";
import { toast } from "sonner";
import { toFriendlyMessage, logRawError } from "@/lib/settingsSecurityErrors";
import { Link } from "react-router-dom";
import { ChevronRight, Languages, Image as ImageIcon, AtSign, MessageCircle, Eye, Volume2, Clock, Bell, Swords, Lock, Trash2, Info, KeyRound } from "lucide-react";

type Prefs = {
  locale: string;
  default_post_visibility: "public" | "followers" | "private";
  default_category: string | null;
  default_comments_enabled: boolean;
  watermark_enabled: boolean;
  autosave_to_camera_roll: boolean;
  who_can_tag: "everyone" | "followers" | "nobody";
  who_can_mention: "everyone" | "followers" | "nobody";
  who_can_dm: "everyone" | "followers" | "nobody";
  tag_review_required: boolean;
  reduce_motion: boolean;
  larger_text: boolean;
  high_contrast: boolean;
  captions_default_on: boolean;
  autoplay_cellular: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string | null;
  push_likes: boolean;
  push_follows: boolean;
  push_comments: boolean;
  push_battles: boolean;
  default_battle_stake: number;
  auto_accept_battles_from_follows: boolean;
  default_race_scope: "global" | "country" | "city";
  sensitive_content_mode: "blur" | "show" | "hide";
};

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "pt", label: "Português" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "ar", label: "العربية" },
  { code: "he", label: "עברית" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
];

const VERSION = (import.meta as any).env?.VITE_APP_VERSION ?? "dev";

export default function Preferences() {
  const { profile } = useAuth();
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
    // Prefer server-authoritative RPC when available; fall back to direct update.
    const rpc = (supabase.rpc as any)("update_my_preferences", { _patch: patch });
    const { error } = await rpc.then(
      (res: any) => res,
      (err: any) => ({ error: err }),
    );
    if (error) {
      // Fallback to direct update if the RPC isn't deployed yet.
      const { error: e2 } = await supabase.from("profiles").update(patch as any).eq("id", profile.id);
      if (e2) {
        setP(prev);
        logRawError(e2, "settings", { patchKeys: Object.keys(patch) });
        toast.error(toFriendlyMessage(e2, "settings"));
      }
    }
  };

  const ComingSoon = () => (
    <Badge variant="outline" className="ml-2 text-[10px] py-0 px-1.5 border-amber-500/40 text-amber-500">
      Coming soon
    </Badge>
  );

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

        {/* Language */}
        <Section title="Language" icon={Languages}>
          <Row title="App language" hint="Used for in-app copy and dates.">
            <Select value={p.locale} onValueChange={(v) => save({ locale: v })}>
              <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>
        </Section>

        {/* Default post settings */}
        <Section title="Default post settings" icon={ImageIcon}>
          <Row title="Default visibility" hint="New posts use this audience.">
            <Select value={p.default_post_visibility} onValueChange={(v) => save({ default_post_visibility: v as Prefs["default_post_visibility"] })}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="followers">Followers</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row title="Default category">
            <Select value={p.default_category ?? "none"} onValueChange={(v) => save({ default_category: v === "none" ? null : v })}>
              <SelectTrigger className="w-40 h-9"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No default</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c as CrownCategory]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>
          <Row title="Comments enabled by default">
            <Switch checked={p.default_comments_enabled} onCheckedChange={(v) => save({ default_comments_enabled: v })} />
          </Row>
          <Row title="Watermark my photos" hint="Adds a small watermark to new uploads.">
            <Switch checked={p.watermark_enabled} onCheckedChange={(v) => save({ watermark_enabled: v })} />
          </Row>
          <Row title="Save copies to my device" hint="Auto-save originals from the in-app camera.">
            <Switch checked={p.autosave_to_camera_roll} onCheckedChange={(v) => save({ autosave_to_camera_roll: v })} />
          </Row>
        </Section>

        {/* Tagging & mentions — enforcement lands in v1.1; controls disabled until then */}
        <Section title="Tagging & mentions" icon={AtSign}>
          <p className="text-[11px] text-amber-500">
            Server-side enforcement lands in v1.1. Controls below are visible for reference only.
          </p>
          <Row title={<><span>Who can tag me</span><ComingSoon /></>}>
            <Select value={p.who_can_tag} disabled onValueChange={() => {}}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="everyone">Everyone</SelectItem>
                <SelectItem value="followers">Followers</SelectItem>
                <SelectItem value="nobody">Nobody</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row title={<><span>Who can @mention me</span><ComingSoon /></>}>
            <Select value={p.who_can_mention} disabled onValueChange={() => {}}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="everyone">Everyone</SelectItem>
                <SelectItem value="followers">Followers</SelectItem>
                <SelectItem value="nobody">Nobody</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row title={<><span>Review tags before they appear</span><ComingSoon /></>} hint="Tags by others wait for your approval.">
            <Switch checked={p.tag_review_required} disabled onCheckedChange={() => {}} />
          </Row>
        </Section>

        {/* Direct messages — enforcement lands in v1.1 */}
        <Section title="Direct messages" icon={MessageCircle}>
          <Row title={<><span>Who can message me</span><ComingSoon /></>} hint="Full DM privacy enforcement ships in v1.1.">
            <Select value={p.who_can_dm} disabled onValueChange={() => {}}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="everyone">Everyone</SelectItem>
                <SelectItem value="followers">Followers</SelectItem>
                <SelectItem value="nobody">Nobody</SelectItem>
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
          <Row title="Captions on by default" hint="For uploaded videos.">
            <Switch checked={p.captions_default_on} onCheckedChange={(v) => save({ captions_default_on: v })} />
          </Row>
        </Section>

        {/* Playback */}
        <Section title="Playback & data" icon={Volume2}>
          <Row title="Autoplay videos on cellular" hint="Off saves mobile data.">
            <Switch checked={p.autoplay_cellular} onCheckedChange={(v) => save({ autoplay_cellular: v })} />
          </Row>
        </Section>

        {/* Quiet hours */}
        <Section title="Quiet hours" icon={Clock}>
          <p className="text-[11px] text-muted-foreground">Silence non-essential notifications between these times.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">Start</Label>
              <Input type="time" value={p.quiet_hours_start ?? ""} onChange={(e) => save({ quiet_hours_start: e.target.value || null })} className="h-9 bg-input" />
            </div>
            <div>
              <Label className="text-[11px]">End</Label>
              <Input type="time" value={p.quiet_hours_end ?? ""} onChange={(e) => save({ quiet_hours_end: e.target.value || null })} className="h-9 bg-input" />
            </div>
          </div>
          <div>
            <Label className="text-[11px]">Time zone</Label>
            <Input value={p.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone} onChange={(e) => save({ timezone: e.target.value || null })} className="h-9 bg-input" />
          </div>
        </Section>

        {/* Push channels */}
        <Section title="Push notification categories" icon={Bell}>
          <Row title="Likes & reactions"><Switch checked={p.push_likes} onCheckedChange={(v) => save({ push_likes: v })} /></Row>
          <Row title="New followers"><Switch checked={p.push_follows} onCheckedChange={(v) => save({ push_follows: v })} /></Row>
          <Row title="Comments & replies"><Switch checked={p.push_comments} onCheckedChange={(v) => save({ push_comments: v })} /></Row>
          <Row title="Battles & duels"><Switch checked={p.push_battles} onCheckedChange={(v) => save({ push_battles: v })} /></Row>
        </Section>

        {/* Crown defaults */}
        <Section title="Crown defaults" icon={Swords}>
          <Row title="Default battle stake (shekels)">
            <Input
              type="number" min={0} value={p.default_battle_stake}
              onChange={(e) => save({ default_battle_stake: Math.max(0, Number(e.target.value) || 0) })}
              className="w-24 h-9 bg-input"
            />
          </Row>
          <Row title="Auto-accept battles from people I follow">
            <Switch checked={p.auto_accept_battles_from_follows} onCheckedChange={(v) => save({ auto_accept_battles_from_follows: v })} />
          </Row>
          <Row title="Default race scope">
            <Select value={p.default_race_scope} onValueChange={(v) => save({ default_race_scope: v as Prefs["default_race_scope"] })}>
              <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global</SelectItem>
                <SelectItem value="country">Country</SelectItem>
                <SelectItem value="city">City</SelectItem>
              </SelectContent>
            </Select>
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
                toast.error(e instanceof Error ? e.message : "Failed to clear cache");
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
    if (error) { toast.error(error.message); return; }
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
