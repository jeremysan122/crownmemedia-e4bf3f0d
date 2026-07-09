import { useEffect, useMemo, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import {
  Copy, Share2, Gift, Crown, Check, Users, Sparkles,
  MessageCircle, Mail, Twitter, Facebook, Send, Trophy, MapPin, Globe,
} from "lucide-react";
import { toast } from "sonner";
import { logRawError } from "@/lib/settingsSecurityErrors";
import { PER_SIGNUP_SHEKELS, PASS_BONUS_DAYS } from "@/lib/inviteRedeem";

/**
 * Invite page — both the inviter and the invitee receive +200 shekels on
 * signup, and an additional +30 free Royal Pass days each if both sides
 * activate Royal Pass. Codes are stable per user.
 */

interface RedemptionRow {
  id: string;
  inviter_id: string;
  invitee_id: string;
  signup_rewarded: boolean;
  pass_rewarded: boolean;
  created_at: string;
}

interface InviteeProfile {
  id: string;
  username: string;
  profile_photo_url: string | null;
}

export default function Invite() {
  const { user } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [redeem, setRedeem] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [redemptions, setRedemptions] = useState<RedemptionRow[]>([]);
  const [myRedemption, setMyRedemption] = useState<RedemptionRow | null>(null);
  const [profilesById, setProfilesById] = useState<Record<string, InviteeProfile>>({});

  // Leaderboard state
  type LbScope = "city" | "state" | "country" | "global";
  type LbMode = "friends" | "rewards";
  type LbRow = {
    rank: number; user_id: string; username: string | null;
    profile_photo_url: string | null; friends: number;
    signup_shekels: number; pass_days: number; reward_score?: number; is_me: boolean;
  };
  type LbResp = {
    scope: LbScope;
    mode?: LbMode;
    region: { city: string | null; state: string | null; country: string | null };
    top: LbRow[];
    me: { rank: number | null; friends: number; signup_shekels: number; pass_days: number; reward_score?: number };
    total_inviters: number;
  };
  const [lbScope, setLbScope] = useState<LbScope>("city");
  const [lbMode, setLbMode] = useState<LbMode>("friends");
  const [lb, setLb] = useState<LbResp | null>(null);
  const [lbLoading, setLbLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!user) return;
    // All redemptions involving me (as inviter or invitee)
    const { data: rows } = await supabase
      .from("invite_redemptions")
      .select("id, inviter_id, invitee_id, signup_rewarded, pass_rewarded, created_at")
      .or(`inviter_id.eq.${user.id},invitee_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    const list = (rows ?? []) as RedemptionRow[];
    const asInviter = list.filter((r) => r.inviter_id === user.id);
    const asInvitee = list.find((r) => r.invitee_id === user.id) ?? null;
    setRedemptions(asInviter);
    setMyRedemption(asInvitee);

    // Hydrate counterparty profiles
    const otherIds = Array.from(new Set([
      ...asInviter.map((r) => r.invitee_id),
      ...(asInvitee ? [asInvitee.inviter_id] : []),
    ]));
    if (otherIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, profile_photo_url")
        .in("id", otherIds);
      const map: Record<string, InviteeProfile> = {};
      (profs ?? []).forEach((p) => { map[p.id] = p as InviteeProfile; });
      setProfilesById(map);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    supabase.rpc("get_or_create_my_invite_code").then(({ data, error }) => {
      if (error) {
        logRawError(error, "generic", { op: "get_or_create_my_invite_code" });
        toast.error("Couldn't load your invite code. Try again.");
      } else setCode((data as string) || null);
      setLoading(false);
    });
    loadStatus();
  }, [user, loadStatus]);

  // Realtime: refresh stats when redemptions involving me change
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`invite-watch-${user.id}`)
      .on("postgres_changes",
          { event: "*", schema: "public", table: "invite_redemptions", filter: `inviter_id=eq.${user.id}` },
          () => loadStatus())
      .on("postgres_changes",
          { event: "*", schema: "public", table: "invite_redemptions", filter: `invitee_id=eq.${user.id}` },
          () => loadStatus())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, loadStatus]);

  // Load leaderboard whenever scope or mode changes or redemptions update
  const loadLeaderboard = useCallback(async (scope: LbScope, mode: LbMode) => {
    if (!user) return;
    setLbLoading(true);
    const { data, error } = await supabase.rpc("invite_leaderboard", { _scope: scope, _limit: 20, _mode: mode });
    setLbLoading(false);
    if (error) return;
    setLb(data as unknown as LbResp);
  }, [user]);

  useEffect(() => { loadLeaderboard(lbScope, lbMode); }, [lbScope, lbMode, loadLeaderboard, redemptions.length]);

  const link = typeof window !== "undefined" && code
    ? `${window.location.origin}/?ref=${code}`
    : "";
  const shareText = `Join me on CrownMe — use my code ${code ?? ""} and we both get ${PER_SIGNUP_SHEKELS} shekels 👑`;

  const copyLink = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Invite link copied");
    setTimeout(() => setCopied(false), 1500);
  };

  const copyCode = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    toast.success("Code copied");
  };

  const share = async () => {
    if (!link) return;
    if (typeof navigator !== "undefined" && (navigator as Navigator).share) {
      try {
        await (navigator as Navigator).share({
          title: "Join me on CrownMe",
          text: shareText,
          url: link,
        });
      } catch { /* user cancelled */ }
    } else {
      copyLink();
    }
  };

  const onRedeem = async () => {
    if (!redeem.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("redeem_invite_code", { _code: redeem.trim() });
    setBusy(false);
    if (error) {
      const msg = error.message || "";
      logRawError(error, "generic", { op: "redeem_invite_code" });
      toast.error(
        msg.includes("yourself")
          ? "You cannot invite yourself"
          : msg.includes("not found")
          ? "Invite code not found"
          : "Couldn't redeem this invite code. Try again.",
      );
      return;
    }
    const result = data as { ok?: boolean; already_redeemed?: boolean; shekels_awarded?: number };
    if (result?.already_redeemed) {
      toast.info("You've already redeemed an invite code.");
    } else {
      const amt = result?.shekels_awarded ?? PER_SIGNUP_SHEKELS;
      toast.success(`Invite redeemed — +${amt} shekels added 👑`, {
        description: "Your inviter also got +200 shekels. If both of you activate Royal Pass, you each get +30 free days.",
        duration: 6000,
      });
    }
    setRedeem("");
    loadStatus();
  };

  // Aggregate stats
  const totals = useMemo(() => {
    const friends = redemptions.length;
    const signupEarned = redemptions.filter((r) => r.signup_rewarded).length * PER_SIGNUP_SHEKELS;
    const signupPending = redemptions.filter((r) => !r.signup_rewarded).length * PER_SIGNUP_SHEKELS;
    const passEarned = redemptions.filter((r) => r.pass_rewarded).length * PASS_BONUS_DAYS;
    const passPending = friends * PASS_BONUS_DAYS - passEarned; // up to N*30 days possible
    return { friends, signupEarned, signupPending, passEarned, passPending };
  }, [redemptions]);

  const myStatus = useMemo(() => {
    if (!myRedemption) return null;
    return {
      inviter: profilesById[myRedemption.inviter_id],
      signupRewarded: myRedemption.signup_rewarded,
      passRewarded: myRedemption.pass_rewarded,
    };
  }, [myRedemption, profilesById]);

  // Channel-specific share helpers
  const enc = encodeURIComponent;
  const shareUrls = {
    sms: `sms:?&body=${enc(`${shareText} ${link}`)}`,
    email: `mailto:?subject=${enc("Join me on CrownMe")}&body=${enc(`${shareText}\n\n${link}`)}`,
    twitter: `https://twitter.com/intent/tweet?text=${enc(shareText)}&url=${enc(link)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${enc(link)}`,
    whatsapp: `https://wa.me/?text=${enc(`${shareText} ${link}`)}`,
    telegram: `https://t.me/share/url?url=${enc(link)}&text=${enc(shareText)}`,
  };

  return (
    <AppShell title="INVITE">
      <div className="px-4 py-5 max-w-xl mx-auto space-y-5">
        <header className="text-center">
          <h1 className="font-display text-3xl text-gold">Invite the Court</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Share your royal code. Both of you get rewards.
          </p>
        </header>

        {/* Reward rules */}
        <div className="grid grid-cols-2 gap-3">
          <div className="royal-card p-4 text-center">
            <Gift size={20} className="mx-auto text-primary mb-1.5" />
            <div className="font-display text-lg text-gold">+{PER_SIGNUP_SHEKELS} ₪</div>
            <p className="text-[11px] text-muted-foreground">For each of you on signup</p>
          </div>
          <div className="royal-card p-4 text-center">
            <Crown size={20} className="mx-auto text-primary mb-1.5" />
            <div className="font-display text-lg text-gold">+{PASS_BONUS_DAYS} days</div>
            <p className="text-[11px] text-muted-foreground">Royal Pass each, if both subscribe</p>
          </div>
        </div>

        {/* My invite code */}
        <section className="royal-card p-4 space-y-3">
          <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">Your invite code</Label>
          <button
            onClick={copyCode}
            disabled={!code}
            className="w-full h-14 rounded-xl bg-input/70 border border-border flex items-center justify-center font-display text-2xl tracking-[0.4em] text-gold hover:border-primary/40 active:scale-[0.99] transition disabled:opacity-50"
            aria-label="Tap to copy code"
          >
            {loading ? "…" : code ?? "—"}
          </button>
          <div className="flex items-center gap-2">
            <Button onClick={copyLink} disabled={!code} variant="outline" className="flex-1 h-11">
              {copied ? <Check size={16} className="mr-1.5" /> : <Copy size={16} className="mr-1.5" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button onClick={share} disabled={!code} className="flex-1 h-11 bg-gradient-gold text-primary-foreground">
              <Share2 size={16} className="mr-1.5" /> Share
            </Button>
          </div>
          {link && <p className="text-[11px] text-muted-foreground break-all">{link}</p>}

          {/* Channel buttons */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <ChannelButton href={shareUrls.sms} icon={<MessageCircle size={14} />} label="SMS" />
            <ChannelButton href={shareUrls.email} icon={<Mail size={14} />} label="Email" />
            <ChannelButton href={shareUrls.whatsapp} icon={<Send size={14} />} label="WhatsApp" />
            <ChannelButton href={shareUrls.telegram} icon={<Send size={14} />} label="Telegram" />
            <ChannelButton href={shareUrls.twitter} icon={<Twitter size={14} />} label="X / Twitter" />
            <ChannelButton href={shareUrls.facebook} icon={<Facebook size={14} />} label="Facebook" />
          </div>
        </section>

        {/* My invite status (if I was invited by someone) */}
        {myStatus && (
          <section className="royal-card p-4 space-y-2">
            <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">You were invited</Label>
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-muted overflow-hidden flex items-center justify-center">
                {myStatus.inviter?.profile_photo_url
                  ? <img loading="lazy" src={myStatus.inviter.profile_photo_url} alt="" className="w-full h-full object-cover" />
                  : <Users size={16} className="text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">@{myStatus.inviter?.username ?? "your inviter"}</p>
                <p className="text-[11px] text-muted-foreground">
                  Signup bonus: {myStatus.signupRewarded ? "✓ +200 ₪ earned" : "pending"} ·
                  {" "}Pass bonus: {myStatus.passRewarded ? `✓ +${PASS_BONUS_DAYS} days earned` : "unlocks when both have Royal Pass"}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Friends joined + reward stats */}
        <section className="royal-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">Your invite status</Label>
            <span className="text-[11px] text-muted-foreground tabular-nums">{totals.friends} joined</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              icon={<Users size={16} className="text-primary" />}
              label="Friends joined"
              value={totals.friends.toString()}
            />
            <StatTile
              icon={<Sparkles size={16} className="text-primary" />}
              label="Earned"
              value={`${totals.signupEarned + 0} ₪${totals.passEarned ? ` · +${totals.passEarned}d` : ""}`}
              hint={`${totals.passEarned}d Royal Pass earned`}
            />
            <StatTile
              icon={<Gift size={16} className="text-muted-foreground" />}
              label="Signup bonus pending"
              value={`${totals.signupPending} ₪`}
              hint="Awarded the moment they create an account."
            />
            <StatTile
              icon={<Crown size={16} className="text-muted-foreground" />}
              label="Pass bonus pending"
              value={`up to ${totals.passPending}d`}
              hint="Granted when both you and the friend have an active Royal Pass."
            />
          </div>

          {redemptions.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Friends &amp; rewards</p>
              <ul className="space-y-3">
                {redemptions.slice(0, 12).map((r) => {
                  const p = profilesById[r.invitee_id];
                  // Two reward steps: signup bonus (auto) + pass bonus (both must subscribe)
                  const earnedSteps = (r.signup_rewarded ? 1 : 0) + (r.pass_rewarded ? 1 : 0);
                  const pct = (earnedSteps / 2) * 100;
                  return (
                    <li key={r.id} className="space-y-1.5">
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-full bg-muted overflow-hidden flex items-center justify-center">
                          {p?.profile_photo_url
                            ? <img loading="lazy" src={p.profile_photo_url} alt="" className="w-full h-full object-cover" />
                            : <Users size={14} className="text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">@{p?.username ?? r.invitee_id.slice(0, 8)}</p>
                          <p className="text-[10px] text-muted-foreground tabular-nums">
                            {earnedSteps}/2 rewards unlocked
                          </p>
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <RewardChip
                          label={`Signup +${PER_SIGNUP_SHEKELS} ₪`}
                          earned={r.signup_rewarded}
                          pendingHint="Awarded instantly on join"
                        />
                        <RewardChip
                          label={`Pass +${PASS_BONUS_DAYS} days`}
                          earned={r.pass_rewarded}
                          pendingHint="Both need active Royal Pass"
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        {/* Invite leaderboard */}
        <section className="royal-card p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Label className="text-[11px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Trophy size={12} className="text-primary" /> Invite leaderboard
            </Label>
            <div className="flex rounded-full bg-muted/40 p-0.5 text-[10px]">
              {(["city", "state", "country", "global"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setLbScope(s)}
                  className={`px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider transition ${
                    lbScope === s ? "bg-gradient-gold text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Ranking-mode toggle */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Rank by</span>
            <div className="flex rounded-full bg-muted/40 p-0.5 text-[10px]">
              <button
                onClick={() => setLbMode("friends")}
                className={`px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider transition flex items-center gap-1 ${
                  lbMode === "friends" ? "bg-gradient-gold text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Users size={10} /> Friends
              </button>
              <button
                onClick={() => setLbMode("rewards")}
                className={`px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider transition flex items-center gap-1 ${
                  lbMode === "rewards" ? "bg-gradient-gold text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles size={10} /> Total rewards
              </button>
            </div>
          </div>

          {lb && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              {lbScope === "global" ? <Globe size={10} /> : <MapPin size={10} />}
              {lbScope === "global"
                ? "Worldwide"
                : lbScope === "country"
                ? lb.region.country ?? "Set your country in profile"
                : lbScope === "state"
                ? `${lb.region.state ?? "—"}, ${lb.region.country ?? ""}`
                : `${lb.region.city ?? "—"}, ${lb.region.state ?? ""}`}
              {" · "}{lb.total_inviters} active inviter{lb.total_inviters === 1 ? "" : "s"}
            </p>
          )}

          {/* My rank tile */}
          {lb && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
              <div className="size-10 rounded-full bg-gradient-gold flex items-center justify-center font-display text-primary-foreground text-sm">
                {lb.me.rank ? `#${lb.me.rank}` : "—"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">Your rank{lb.me.rank ? "" : " (no friends yet)"}</p>
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  {lb.me.friends} friend{lb.me.friends === 1 ? "" : "s"} · +{Number(lb.me.signup_shekels)} ₪
                  {lb.me.pass_days ? ` · +${lb.me.pass_days}d Pass` : ""}
                </p>
              </div>
            </div>
          )}

          {lbLoading && !lb && <p className="text-[11px] text-muted-foreground py-2">Loading leaderboard…</p>}

          {lb && lb.top.length === 0 && (
            <p className="text-[11px] text-muted-foreground py-2">
              No inviters in this region yet. Be the first 👑
            </p>
          )}

          {lb && lb.top.length > 0 && (
            <ul className="space-y-1.5">
              {lb.top.map((row) => {
                const rewardScore = row.reward_score ?? (Number(row.signup_shekels) + row.pass_days * 50);
                const primaryMetric = lbMode === "rewards"
                  ? <>{rewardScore} <span className="text-muted-foreground">pts</span></>
                  : <>{row.friends} 👥</>;
                const secondaryMetric = lbMode === "rewards"
                  ? <>{row.friends} friend{row.friends === 1 ? "" : "s"}</>
                  : <>+{Number(row.signup_shekels)} ₪{row.pass_days ? ` · +${row.pass_days}d` : ""}</>;
                return (
                  <li
                    key={row.user_id}
                    className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${
                      row.is_me ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/30"
                    }`}
                  >
                    <span className={`w-7 text-center font-display text-sm ${row.rank <= 3 ? "text-gold" : "text-muted-foreground"}`}>
                      #{row.rank}
                    </span>
                    <div className="size-7 rounded-full bg-muted overflow-hidden flex items-center justify-center">
                      {row.profile_photo_url
                        ? <img loading="lazy" src={row.profile_photo_url} alt="" className="w-full h-full object-cover" />
                        : <Users size={12} className="text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">
                        @{row.username ?? row.user_id.slice(0, 8)}{row.is_me && <span className="text-primary"> · you</span>}
                      </p>
                    </div>
                    <div className="text-right text-[10px] tabular-nums">
                      <div className="font-semibold">{primaryMetric}</div>
                      <div className="text-muted-foreground">{secondaryMetric}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* How it works */}
        <section className="royal-card p-4 space-y-2">
          <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">How rewards work</Label>
          <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal list-inside">
            <li>Share your link or code with friends.</li>
            <li>When they sign up using your code, <span className="text-foreground font-semibold">both of you get +{PER_SIGNUP_SHEKELS} shekels</span> instantly.</li>
            <li>If <span className="text-foreground font-semibold">both</span> of you have an active Royal Pass, <span className="text-foreground font-semibold">both get +{PASS_BONUS_DAYS} free Pass days</span>. The bonus extends your current renewal.</li>
            <li>One redemption per account. Self-invites are not allowed.</li>
          </ol>
        </section>

        {/* Redeem section (only shown if I haven't already) */}
        {!myStatus && (
          <section className="royal-card p-4 space-y-3">
            <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">Have a code?</Label>
            <div className="flex items-center gap-2">
              <Input
                value={redeem}
                onChange={(e) => setRedeem(e.target.value.toUpperCase())}
                placeholder="ENTER CODE"
                maxLength={16}
                className="h-12 bg-input tracking-[0.3em] uppercase text-center"
              />
              <Button onClick={onRedeem} disabled={busy || !redeem.trim()} className="bg-gradient-gold text-primary-foreground h-12">
                {busy ? "…" : "Redeem"}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              One redemption per account. Self-invites are not allowed.
            </p>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function StatTile({
  icon, label, value, hint,
}: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-muted/30 border border-border/40 p-3">
      <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span></div>
      <div className="font-display text-base text-gold tabular-nums">{value}</div>
      {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function ChannelButton({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="h-9 rounded-full bg-muted/40 hover:bg-muted/60 border border-border/40 flex items-center justify-center gap-1.5 text-[11px] font-semibold transition active:scale-95"
    >
      {icon} {label}
    </a>
  );
}

function RewardChip({ label, earned, pendingHint }: { label: string; earned: boolean; pendingHint: string }) {
  return (
    <div
      title={earned ? "Reward earned" : pendingHint}
      className={`flex items-center gap-1 px-2 py-1 rounded-full border ${
        earned
          ? "bg-primary/15 border-primary/40 text-primary"
          : "bg-muted/30 border-border/40 text-muted-foreground"
      }`}
    >
      {earned ? <Check size={10} /> : <Crown size={10} className="opacity-60" />}
      <span className="truncate">{label}</span>
    </div>
  );
}
