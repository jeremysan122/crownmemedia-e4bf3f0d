import AppShell from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useNavigate, Link } from "react-router-dom";
import { LogOut, Shield, Bell, ChevronRight, Store, MessageCircle, AtSign, Reply, Coins, Swords, Trophy, Smartphone, Volume2, Play, Crown, Edit3, Scale, Lock, Flag, Sun, Moon, Monitor, Gift, Ban, Eye, EyeOff, Users, Globe2, Archive, FileEdit, SlidersHorizontal, Filter, UserMinus, Download, CheckCircle2 } from "lucide-react";
import { downloadMyData } from "@/lib/downloadMyData";
import { toast } from "sonner";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useNotificationPrefs } from "@/hooks/useNotificationPrefs";
import { useUnreadByType } from "@/hooks/useUnreadByType";
import StripeConnectSection from "@/components/settings/StripeConnectSection";
import PayoutPanel from "@/components/settings/PayoutPanel";
import AccountDangerZone from "@/components/account/AccountDangerZone";
import { playNotificationSound } from "@/lib/notificationSounds";
import { useTheme } from "@/context/ThemeContext";
import { supabase } from "@/integrations/supabase/client";
import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { useWebPush } from "@/hooks/useWebPush";

export default function Settings() {
  useSeoMeta({ title: "Settings · CrownMe", noIndex: true });
  const { signOut, isModerator, profile, refreshProfile } = useAuth();
  const nav = useNavigate();
  const { prefs, update: updatePrefs } = useNotificationPrefs();
  const unread = useUnreadByType();
  const { theme, setTheme } = useTheme();
  const { state: pushState, enable: enablePush, disable: disablePush } = useWebPush();

  const out = async () => { await signOut(); nav("/", { replace: true }); };

  const togglePublicLikes = async (next: boolean) => {
    if (!profile?.id) return;
    const { error } = await supabase
      .from("profiles")
      .update({ liked_posts_public: next } as any)
      .eq("id", profile.id);
    if (error) { toast.error(error.message); return; }
    await refreshProfile();
    toast.success(next ? "Liked posts are now visible to others" : "Liked posts are now private");
  };

  type PrivacyRow = {
    is_private: boolean;
    hide_likes: boolean;
    hide_comments: boolean;
    hide_views: boolean;
    posts_visibility: "public" | "followers" | "private";
  };
  const [priv, setPriv] = useState<PrivacyRow | null>(null);
  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from("profiles")
      .select("is_private, hide_likes, hide_comments, hide_views, posts_visibility")
      .eq("id", profile.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error("[Settings] privacy fetch failed:", error.message);
        else if (data) setPriv(data as PrivacyRow);
      }, (e) => console.error("[Settings] privacy fetch threw:", e));
  }, [profile?.id]);

  const updatePriv = async (patch: Partial<PrivacyRow>) => {
    if (!profile?.id || !priv) return;
    const next = { ...priv, ...patch };
    setPriv(next);
    const { error } = await supabase.from("profiles").update(patch as any).eq("id", profile.id);
    if (error) { toast.error(error.message); setPriv(priv); return; }
    toast.success("Privacy updated");
  };
  return (
    <AppShell title="SETTINGS">
      <div className="px-4 py-4 space-y-5">
        <h1 className="font-display text-2xl text-gold">Settings</h1>

        <Link
          to="/edit-profile"
          className="royal-card p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors"
          aria-label="Edit your profile"
        >
          <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
            <Edit3 size={18} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Edit Profile</div>
            <div className="text-[11px] text-muted-foreground">Photo, bio, and location</div>
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </Link>

        <Link
          to="/invite"
          className="royal-card p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors"
          aria-label="Invite friends and earn rewards"
        >
          <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <Gift size={18} className="text-emerald-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Invite friends · Earn rewards</div>
            <div className="text-[11px] text-muted-foreground">+200 shekels for both, +30 Pass days when they upgrade</div>
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </Link>

        <Link
          to="/rewards"
          className="royal-card p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors lg:hidden"
          aria-label="Daily rewards and royal spin wheel"
        >
          <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center">
            <Gift size={18} className="text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Daily Rewards</div>
            <div className="text-[11px] text-muted-foreground">Claim your daily shekels and spin the royal wheel</div>
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </Link>

        <Link
          to="/verification"
          className="royal-card p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors"
          aria-label="Apply for a verified badge"
        >
          <div className="w-10 h-10 rounded-full bg-sky-500/15 flex items-center justify-center">
            <CheckCircle2 size={18} className="text-sky-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold flex items-center gap-1.5">
              {(profile as any)?.verified ? "Verified" : "Get verified"}
              {(profile as any)?.verified && <CheckCircle2 size={14} className="fill-sky-500 text-background" />}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {(profile as any)?.verified ? "Manage your verification" : "Standard (100k+ followers) or $1.99/mo fast-track"}
            </div>
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </Link>


        <section className="royal-card p-4 space-y-3">
          <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">Browser push</h2>
          <p className="text-[11px] text-muted-foreground">
            Get alerts even when the CrownMe tab is closed. Uses your device's notification system.
          </p>
          <div className="flex items-center gap-3">
            <Smartphone size={18} className="text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">
                {pushState === "on" ? "Enabled on this device" :
                 pushState === "denied" ? "Blocked by browser" :
                 pushState === "unsupported" ? "Not supported in this browser" :
                 "Off"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {pushState === "denied" ? "Enable notifications in your browser site settings, then refresh." : "Tap to toggle on this device."}
              </div>
            </div>
            <Button
              size="sm"
              variant={pushState === "on" ? "outline" : "default"}
              disabled={pushState === "loading" || pushState === "unsupported" || pushState === "denied"}
              onClick={() => pushState === "on" ? disablePush() : enablePush()}
              className="h-8"
            >
              {pushState === "on" ? "Disable" : "Enable"}
            </Button>
          </div>
        </section>

        <section className="royal-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">Notification Alerts</h2>
            {unread.total > 0 && (
              <Link to="/notifications" className="text-[11px] font-bold text-primary hover:underline tabular-nums">
                {unread.total} unread
              </Link>
            )}
          </div>
          {[
            { key: "reply_alerts" as const, Icon: Reply, title: "Reply alerts", hint: "When someone replies to your comment", unread: unread.reply },
            { key: "mention_alerts" as const, Icon: AtSign, title: "Mention alerts", hint: "When someone @mentions you", unread: unread.mention },
            { key: "dm_alerts" as const, Icon: MessageCircle, title: "Direct message alerts", hint: "When someone sends you a DM", unread: unread.dm },
            { key: "battle_invite_alerts" as const, Icon: Swords, title: "Battle invites", hint: "When someone challenges you to a duel", unread: 0 },
            { key: "battle_winner_alerts" as const, Icon: Trophy, title: "Battle results", hint: "When a battle you're in ends with a winner", unread: 0 },
            { key: "sound_enabled" as const, Icon: Volume2, title: "Notification sounds", hint: "Play a short royal chime for battle alerts", unread: 0 },
            { key: "push_enabled" as const, Icon: Smartphone, title: "Push notifications", hint: "Receive alerts on this device when the app is closed", unread: 0 },
          ].map(({ key, Icon, title, hint, unread: u }) => (
            <div key={key} className="flex items-center gap-3 py-1.5">
              <Icon size={18} className="text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold flex items-center gap-2">
                  {title}
                  {u > 0 && (
                    <span className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                      {u} new
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">{hint}</div>
              </div>
              <Switch
                checked={prefs[key]}
                onCheckedChange={async (v) => {
                  if (key === "push_enabled" && v && typeof Notification !== "undefined") {
                    try {
                      const perm = await Notification.requestPermission();
                      if (perm !== "granted") {
                        toast.error("Push permission denied", { description: "Enable notifications in your browser settings to receive push alerts." });
                        return;
                      }
                    } catch { /* noop */ }
                  }
                  updatePrefs({ [key]: v });
                }}
                aria-label={title}
              />
            </div>
          ))}

          {prefs.sound_enabled && (
            <div className="flex items-center gap-2 pt-2 border-t border-border/40">
              <span className="text-[11px] text-muted-foreground flex-1">Preview sounds</span>
              <Button size="sm" variant="outline" className="h-7 text-[11px]"
                onClick={() => playNotificationSound("invite")}>
                <Play size={10} /> Invite
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px]"
                onClick={() => playNotificationSound("winner")}>
                <Play size={10} /> Winner
              </Button>
            </div>
          )}
        </section>

        <section className="royal-card p-4 space-y-3">
          <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">
            Appearance
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Switch between dark, light, or follow your device.
          </p>
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
            {([
              { value: "dark", label: "Dark", Icon: Moon },
              { value: "light", label: "Light", Icon: Sun },
              { value: "system", label: "System", Icon: Monitor },
            ] as const).map(({ value, label, Icon }) => {
              const active = theme === value;
              return (
                <button
                  key={value}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTheme(value)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border transition ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:border-border/80"
                  }`}
                >
                  <Icon size={18} />
                  <span className="text-[11px] font-semibold">{label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="royal-card p-4 space-y-3">
          <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">Privacy</h2>

          {/* Account visibility radio */}
          <div className="space-y-1.5">
            <div className="text-sm font-semibold">Who can see my posts</div>
            <div className="text-[11px] text-muted-foreground">Applies to your feed appearances and profile grid.</div>
            <div role="radiogroup" aria-label="Posts visibility" className="grid grid-cols-3 gap-2 pt-1">
              {([
                { value: "public", label: "Public", Icon: Globe2 },
                { value: "followers", label: "Followers", Icon: Users },
                { value: "private", label: "Private", Icon: Lock },
              ] as const).map(({ value, label, Icon }) => {
                const active = (priv?.posts_visibility ?? "public") === value;
                return (
                  <button
                    key={value}
                    role="radio"
                    aria-checked={active}
                    disabled={!priv}
                    onClick={() => updatePriv({ posts_visibility: value })}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl border transition ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:border-border/80"
                    }`}
                  >
                    <Icon size={16} />
                    <span className="text-[11px] font-semibold">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {[
            { key: "is_private" as const, Icon: Lock, title: "Private account", hint: "Only approved followers can see your posts and profile activity." },
            { key: "hide_likes" as const, Icon: Heart, title: "Hide like counts", hint: "Hides reaction counts on your posts from other people." },
            { key: "hide_comments" as const, Icon: MessageCircle, title: "Turn off comments", hint: "Stops anyone from commenting on your posts." },
            { key: "hide_views" as const, Icon: EyeOff, title: "Hide view counts", hint: "Hides the views indicator on your posts." },
          ].map(({ key, Icon, title, hint }) => (
            <div key={key} className="flex items-center gap-3 py-1.5">
              <Icon size={18} className="text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{title}</div>
                <div className="text-[11px] text-muted-foreground">{hint}</div>
              </div>
              <Switch
                checked={!!priv?.[key]}
                disabled={!priv}
                onCheckedChange={(v) => updatePriv({ [key]: v } as Partial<PrivacyRow>)}
                aria-label={title}
              />
            </div>
          ))}

          <div className="flex items-center gap-3 py-1.5 border-t border-border/40 pt-3">
            <Heart size={18} className="text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">Show my liked posts tab</div>
              <div className="text-[11px] text-muted-foreground">When off, the Liked tab on your profile is hidden from other people.</div>
            </div>
            <Switch
              checked={profile?.liked_posts_public ?? true}
              onCheckedChange={togglePublicLikes}
              aria-label="Show liked posts on my profile"
            />
          </div>
        </section>

        <StripeConnectSection />
        <PayoutPanel />

        <section className="royal-card divide-y divide-border">
          {[
            { to: "/preferences", label: "Preferences", Icon: SlidersHorizontal },
            { to: "/muted-words", label: "Muted Words", Icon: Filter },
            { to: "/restricted", label: "Restricted Accounts", Icon: UserMinus },
            { to: "/drafts", label: "Drafts", Icon: FileEdit },
            { to: "/archived", label: "Archived posts", Icon: Archive },
            { to: "/store", label: "Royal Store", Icon: Store },
            { to: "/royal-pass", label: "Royal Pass", Icon: Crown },
            { to: "/wallet", label: "Wallet & Billing", Icon: Coins },
            { to: "/notifications", label: "Notifications", Icon: Bell },
            { to: "/privacy", label: "Privacy & Data", Icon: Lock },
            { to: "/blocked", label: "Blocked Accounts", Icon: Ban },
            { to: "/reports/mine", label: "My Reports & Appeals", Icon: Flag },
            { to: "/legal", label: "Legal Center", Icon: Scale },
            { to: "/account/legal", label: "My Legal Acceptances", Icon: Scale },
            { to: "/appeals/sensitive", label: "My Sensitive Appeals", Icon: Flag },
            ...(isModerator ? [
              { to: "/admin", label: "Moderator Panel", Icon: Shield },
              { to: "/admin/sensitive-appeals", label: "Sensitive Appeals Queue", Icon: Shield },
              { to: "/admin/compliance", label: "Legal Compliance Check", Icon: Shield },
              { to: "/admin/bundles", label: "Shekel Bundles & Webhooks", Icon: Coins },
            ] : []),
          ].map(({ to, label, Icon }) => (
            <Link key={to} to={to} className="flex items-center gap-3 p-4 hover:bg-muted/30">
              <Icon size={18} className="text-muted-foreground" />
              <span className="flex-1 text-sm">{label}</span>
              <ChevronRight size={16} className="text-muted-foreground" />
            </Link>
          ))}
        </section>

        <section className="royal-card p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-gold/20 flex items-center justify-center shrink-0">
              <Download size={18} className="text-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">Download my data</div>
              <div className="text-[11px] text-muted-foreground">
                Get a ZIP of your profile, posts, comments, DMs, wallet ledger and signed links to your uploads.
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full"
            disabled={!profile?.id}
            onClick={async () => {
              if (!profile?.id) return;
              const t = toast.loading("Preparing your data export…");
              try {
                await downloadMyData(profile.id, profile.username);
                toast.success("Download started", { id: t });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Export failed", { id: t });
              }
            }}
          >
            <Download size={14} className="mr-2" /> Download ZIP
          </Button>
        </section>

        <AccountDangerZone />

        <Button onClick={out} variant="outline" className="w-full text-destructive border-destructive/40">
          <LogOut size={16} className="mr-2" /> Log out
        </Button>
      </div>
    </AppShell>
  );
}
