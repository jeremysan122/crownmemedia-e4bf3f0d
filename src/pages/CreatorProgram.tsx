import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Crown, Copy, Check, Loader2, Sparkles, Users, TrendingUp, DollarSign } from "lucide-react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";

type CreatorProgram = {
  id: string;
  user_id: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  referral_code: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  application_note: string | null;
};

type Milestone = {
  milestone_key: string;
  label: string;
  required_count: number;
  reward_type: string;
  sort_order: number;
};

type Reward = {
  id: string;
  milestone_key: string;
  reward_type: string;
  status: string;
  granted_at: string | null;
};

type Dashboard = {
  program: CreatorProgram | null;
  stats?: {
    total_invites: number;
    active_invites: number;
    posted: number;
    voted: number;
    purchased: number;
    revenue: number;
    conversion_rate: number;
  };
  next_milestone?: {
    milestone_key: string;
    label: string;
    required_count: number;
    progress: number;
    remaining: number;
  } | null;
};

export default function CreatorProgram() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: dash }, { data: ms }, { data: rw }] = await Promise.all([
      supabase.rpc("get_creator_dashboard", { _user_id: user.id }),
      supabase.from("creator_milestones").select("*").eq("active", true).order("sort_order"),
      supabase.from("creator_rewards").select("*").eq("creator_id", user.id).order("created_at", { ascending: false }),
    ]);
    setDashboard((dash as unknown as Dashboard) ?? { program: null });
    setMilestones((ms as Milestone[]) ?? []);
    setRewards((rw as Reward[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load();   }, [user?.id]);

  const apply = async () => {
    setSubmitting(true);
    const { error } = await supabase.rpc("apply_to_creator_program", { _note: note || null });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Application submitted — we'll review shortly 👑");
    load();
  };

  const referralUrl = dashboard?.program?.referral_code
    ? `${window.location.origin}/?ref=${dashboard.program.referral_code}`
    : null;

  const copyRef = async () => {
    if (!referralUrl) return;
    await navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    toast.success("Referral link copied");
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading) {
    return (
      <AppShell><div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="animate-spin" /></div></AppShell>
    );
  }

  const program = dashboard?.program;
  const stats = dashboard?.stats;

  // Not applied yet
  if (!program) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto p-4 space-y-6">
          <div className="text-center space-y-3">
            <Crown className="mx-auto text-gold" size={56} />
            <h1 className="text-3xl font-display text-gold">Creator Early Access</h1>
            <p className="text-muted-foreground">
              Help grow CrownMe. Earn the Verified Badge, Royal Pass, Founder Crown and more by inviting active creators.
            </p>
          </div>
          <Card className="p-5 space-y-4">
            <h2 className="font-bold">Why apply?</h2>
            <ul className="text-sm space-y-2 list-disc pl-5 text-muted-foreground">
              <li>Personal referral link tracked end-to-end</li>
              <li>Unlock real rewards: Verified Badge → Royal Pass → Founder Crown</li>
              <li>Spotlight placement & leaderboard visibility</li>
              <li>Performance dashboard with conversion analytics</li>
            </ul>
            <Textarea
              placeholder="Tell us about your audience (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
            <Button onClick={apply} disabled={submitting} className="w-full bg-gradient-gold text-primary-foreground font-bold">
              {submitting ? <Loader2 className="animate-spin mr-2" size={16} /> : <Sparkles className="mr-2" size={16} />}
              Apply to Creator Program
            </Button>
          </Card>

          <Card className="p-5">
            <h3 className="font-bold mb-3">Milestone rewards</h3>
            <div className="space-y-2">
              {milestones.map((m) => (
                <div key={m.milestone_key} className="flex items-center justify-between text-sm">
                  <span>{m.label}</span>
                  <Badge variant="outline">{m.required_count}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </AppShell>
    );
  }

  // Has applied
  return (
    <AppShell>
      <div className="max-w-3xl mx-auto p-4 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display text-gold flex items-center gap-2">
              <Crown size={28} /> Creator Dashboard
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Status:{" "}
              <Badge variant={program.status === "approved" ? "default" : "secondary"}>
                {program.status}
              </Badge>
            </p>
          </div>
        </div>

        {program.status === "pending" && (
          <Card className="p-4 border-gold/40">
            <p className="text-sm">Your application is under review. You'll be notified once approved.</p>
          </Card>
        )}

        {program.status === "rejected" && (
          <Card className="p-4 border-destructive/40">
            <p className="text-sm font-bold">Application not approved</p>
            {program.rejected_reason && <p className="text-xs text-muted-foreground mt-1">{program.rejected_reason}</p>}
          </Card>
        )}

        {program.status === "suspended" && (
          <Card className="p-4 border-destructive/40">
            <p className="text-sm font-bold">Account suspended from Creator Program</p>
            {program.rejected_reason && <p className="text-xs text-muted-foreground mt-1">{program.rejected_reason}</p>}
          </Card>
        )}

        {program.status === "approved" && referralUrl && (
          <Card className="p-4 space-y-3">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Your referral link</div>
            <div className="flex gap-2 items-center">
              <code className="flex-1 text-sm bg-muted px-3 py-2 rounded truncate">{referralUrl}</code>
              <Button size="sm" variant="outline" onClick={copyRef}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">Code: <span className="font-mono">{program.referral_code}</span></div>
          </Card>
        )}

        {stats && program.status === "approved" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon={<Users size={16} />} label="Total invites" value={stats.total_invites} />
              <StatCard icon={<Sparkles size={16} />} label="Active" value={stats.active_invites} />
              <StatCard icon={<TrendingUp size={16} />} label="Conversion" value={`${stats.conversion_rate}%`} />
              <StatCard icon={<DollarSign size={16} />} label="Revenue" value={`$${Number(stats.revenue).toFixed(2)}`} />
            </div>

            <Card className="p-4 space-y-3">
              <div className="text-sm font-bold">Activity breakdown</div>
              <Row label="Posted" value={stats.posted} />
              <Row label="Voted" value={stats.voted} />
              <Row label="Purchased Shekels" value={stats.purchased} />
            </Card>

            {dashboard?.next_milestone && (
              <Card className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold">Next milestone</div>
                  <Badge variant="outline">{dashboard.next_milestone.remaining} to go</Badge>
                </div>
                <div className="text-sm text-muted-foreground">{dashboard.next_milestone.label}</div>
                <Progress
                  value={(dashboard.next_milestone.progress / dashboard.next_milestone.required_count) * 100}
                />
                <div className="text-xs text-muted-foreground">
                  {dashboard.next_milestone.progress} / {dashboard.next_milestone.required_count}
                </div>
              </Card>
            )}

            <Card className="p-4 space-y-3">
              <div className="text-sm font-bold">Rewards</div>
              {rewards.length === 0 ? (
                <p className="text-xs text-muted-foreground">No rewards unlocked yet — keep inviting active creators.</p>
              ) : (
                rewards.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                    <div>
                      <div className="font-medium">{r.reward_type}</div>
                      <div className="text-xs text-muted-foreground">{r.milestone_key}</div>
                    </div>
                    <Badge variant={r.status === "granted" ? "default" : "secondary"}>{r.status}</Badge>
                  </div>
                ))
              )}
            </Card>

            <Card className="p-4">
              <div className="text-sm font-bold mb-3">All milestones</div>
              <div className="space-y-2">
                {milestones.map((m) => {
                  const progress = Math.min(stats.active_invites, m.required_count);
                  const pct = (progress / m.required_count) * 100;
                  const unlocked = stats.active_invites >= m.required_count;
                  return (
                    <div key={m.milestone_key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className={unlocked ? "text-gold" : ""}>{m.label}</span>
                        <span className="text-muted-foreground">{progress}/{m.required_count}</span>
                      </div>
                      <Progress value={pct} className={unlocked ? "[&>div]:bg-gold" : ""} />
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon} {label}
      </div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}
