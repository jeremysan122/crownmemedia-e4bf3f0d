import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Loader2, Check, X, Crown, Pause } from "lucide-react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";

type ProgramRow = {
  id: string;
  user_id: string;
  status: string;
  referral_code: string | null;
  application_note: string | null;
  created_at: string;
  approved_at: string | null;
  rejected_reason: string | null;
};

type RewardRow = {
  id: string;
  creator_id: string;
  milestone_key: string;
  reward_type: string;
  status: string;
  created_at: string;
};

export default function AdminCreatorProgram() {
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: progs }, { data: rws }] = await Promise.all([
      supabase.from("creator_programs").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("creator_rewards").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setPrograms((progs as ProgramRow[]) ?? []);
    setRewards((rws as RewardRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setStatus = async (userId: string, status: string, reason?: string) => {
    setBusyId(userId);
    const { error } = await supabase.rpc("admin_set_creator_status", {
      _user_id: userId, _status: status, _reason: reason ?? null,
    });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Marked ${status}`);
    load();
  };

  const setRewardStatus = async (rewardId: string, status: string) => {
    setBusyId(rewardId);
    const { error } = await supabase.rpc("admin_set_creator_reward", {
      _reward_id: rewardId, _status: status,
    });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Reward ${status}`);
    load();
  };

  const filtered = programs.filter(p =>
    (statusFilter === "all" || p.status === statusFilter) &&
    (!search || p.user_id.includes(search) || (p.referral_code ?? "").toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto p-4 space-y-5">
        <div className="flex items-center gap-2">
          <Crown className="text-gold" />
          <h1 className="text-2xl font-display text-gold">Creator Program — Admin</h1>
        </div>

        <Tabs defaultValue="applications">
          <TabsList>
            <TabsTrigger value="applications">Applications</TabsTrigger>
            <TabsTrigger value="rewards">Pending rewards</TabsTrigger>
          </TabsList>

          <TabsContent value="applications" className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {["pending","approved","rejected","suspended","all"].map(s => (
                <Button key={s} size="sm" variant={statusFilter===s?"default":"outline"} onClick={() => setStatusFilter(s)}>
                  {s}
                </Button>
              ))}
              <Input placeholder="Search user id or code" value={search} onChange={e=>setSearch(e.target.value)} className="max-w-xs" />
            </div>

            {loading ? <Loader2 className="animate-spin" /> : filtered.length === 0 ? (
              <Card className="p-4 text-center text-sm text-muted-foreground">No applications match.</Card>
            ) : filtered.map(p => (
              <Card key={p.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1 min-w-0">
                    <div className="font-mono text-xs truncate">{p.user_id}</div>
                    <Badge variant={p.status==="approved"?"default":"secondary"}>{p.status}</Badge>
                    {p.referral_code && <span className="ml-2 text-xs">Code: <span className="font-mono">{p.referral_code}</span></span>}
                    {p.application_note && <p className="text-xs text-muted-foreground">{p.application_note}</p>}
                    <div className="text-[10px] text-muted-foreground">Applied {new Date(p.created_at).toLocaleString()}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {p.status !== "approved" && (
                      <Button size="sm" disabled={busyId===p.user_id} onClick={()=>setStatus(p.user_id,"approved")}>
                        <Check size={14} className="mr-1" />Approve
                      </Button>
                    )}
                    {p.status !== "rejected" && (
                      <Button size="sm" variant="outline" disabled={busyId===p.user_id}
                        onClick={()=>{
                          const r = window.prompt("Reason (optional)") ?? undefined;
                          setStatus(p.user_id,"rejected", r);
                        }}>
                        <X size={14} className="mr-1" />Reject
                      </Button>
                    )}
                    {p.status === "approved" && (
                      <Button size="sm" variant="destructive" disabled={busyId===p.user_id}
                        onClick={()=>{
                          const r = window.prompt("Suspension reason") ?? undefined;
                          setStatus(p.user_id,"suspended", r);
                        }}>
                        <Pause size={14} className="mr-1" />Suspend
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="rewards" className="space-y-3">
            {rewards.filter(r=>r.status==="pending").length === 0 && (
              <Card className="p-4 text-center text-sm text-muted-foreground">No rewards waiting for approval.</Card>
            )}
            {rewards.filter(r=>r.status==="pending").map(r => (
              <Card key={r.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-bold text-sm">{r.reward_type}</div>
                  <div className="text-xs text-muted-foreground">{r.milestone_key}</div>
                  <div className="text-[10px] font-mono truncate">{r.creator_id}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" disabled={busyId===r.id} onClick={()=>setRewardStatus(r.id, "granted")}>Grant</Button>
                  <Button size="sm" variant="outline" disabled={busyId===r.id} onClick={()=>setRewardStatus(r.id, "rejected")}>Reject</Button>
                </div>
              </Card>
            ))}

            <div className="text-xs uppercase tracking-widest text-muted-foreground pt-4">History</div>
            {rewards.filter(r=>r.status!=="pending").slice(0,30).map(r => (
              <Card key={r.id} className="p-3 flex items-center justify-between text-sm">
                <div>
                  <div>{r.reward_type} <Badge variant="outline" className="ml-1">{r.status}</Badge></div>
                  <div className="text-[10px] font-mono text-muted-foreground truncate">{r.creator_id}</div>
                </div>
                {r.status === "granted" && (
                  <Button size="sm" variant="outline" disabled={busyId===r.id}
                    onClick={()=>setRewardStatus(r.id, "revoked")}>Revoke</Button>
                )}
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
