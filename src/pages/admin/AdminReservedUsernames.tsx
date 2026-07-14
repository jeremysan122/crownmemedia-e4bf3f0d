import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Database, ClipboardList, UserCheck } from "lucide-react";
import { timeAgo } from "@/lib/crown";

const CLAIM_ERROR_MESSAGES: Record<string, string> = {
  not_authorized: "You don't have admin permission for this action.",
  invalid_username: "Username format is invalid (2–30 lowercase alphanumerics).",
  reservation_not_found: "That username is not in the reserved list.",
  reservation_inactive: "This reservation is currently inactive.",
  reservation_blocked: "Blocked reservations cannot be claimed.",
  reservation_already_claimed: "This reservation has already been claimed.",
  target_user_not_found: "Target user ID does not exist.",
  username_already_assigned: "Another profile already owns this username.",
  missing_auth: "Sign in as an admin to run this action.",
  not_authenticated: "Session expired — sign in again.",
};

function friendlyError(raw: string): string {
  if (!raw) return "Unknown error";
  const key = raw.trim().replace(/^.*?:\s*/, "");
  return CLAIM_ERROR_MESSAGES[key] ?? raw;
}

interface AuditRow {
  id: string;
  action: string;
  username: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  evidence_notes: string | null;
  created_at: string;
}

interface SeedResult {
  ok: boolean;
  parsed?: number;
  upserted?: number;
  chunk_errors?: { chunk: number; error: string }[];
  existing_profile_conflicts?: { username: string; profile_id: string }[];
  error?: string;
}

export default function AdminReservedUsernames() {
  const { isAdmin, loading } = useAuth();
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null);
  const [dryRun, setDryRun] = useState(false);

  const [username, setUsername] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [notes, setNotes] = useState("");
  const [claiming, setClaiming] = useState(false);

  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [counts, setCounts] = useState<{ total: number; claimed: number } | null>(null);

  const loadAudit = async () => {
    const { data } = await supabase
      .from("reserved_username_audit_log")
      .select("id, action, username, actor_user_id, target_user_id, evidence_notes, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    setAudit((data as AuditRow[]) || []);
  };

  const loadCounts = async () => {
    const [{ count: total }, { count: claimed }] = await Promise.all([
      supabase.from("reserved_usernames").select("username", { count: "exact", head: true }),
      supabase
        .from("reserved_usernames")
        .select("username", { count: "exact", head: true })
        .not("claimed_by", "is", null),
    ]);
    setCounts({ total: total ?? 0, claimed: claimed ?? 0 });
  };

  useEffect(() => {
    if (isAdmin) {
      loadAudit();
      loadCounts();
    }
  }, [isAdmin]);

  if (loading) return <AppShell><div className="py-20 text-center">Loading…</div></AppShell>;
  if (!isAdmin) return <Navigate to="/feed" replace />;

  const runSeed = async () => {
    if (!isAdmin) { toast.error("Admin role required"); return; }
    setSeeding(true);
    setSeedResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("seed-reserved-usernames", {
        body: { dryRun },
      });
      if (error) throw error;
      const payload = data as SeedResult;
      if (payload?.error) throw new Error(payload.error);
      setSeedResult(payload);
      toast.success(dryRun ? "Dry run complete" : `Seeded ${payload.upserted ?? 0} rows`);
      loadCounts();
    } catch (e) {
      const raw = (e as Error).message || String(e);
      const msg = friendlyError(raw);
      setSeedResult({ ok: false, error: msg });
      toast.error(`Seed failed: ${msg}`);
    } finally {
      setSeeding(false);
    }
  };

  const runClaim = async () => {
    if (!isAdmin) { toast.error("Admin role required"); return; }
    if (!username.trim() || !targetUserId.trim()) {
      toast.error("Username and target user ID are required");
      return;
    }
    // Basic UUID sanity check to avoid a round-trip on malformed input.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId.trim())) {
      toast.error("Target user ID must be a UUID");
      return;
    }
    setClaiming(true);
    try {
      const { data, error } = await supabase.rpc("admin_claim_reserved_username" as never, {
        _username: username.trim(),
        _target_user_id: targetUserId.trim(),
        _evidence_notes: notes.trim() || null,
      } as never);
      if (error) throw error;
      toast.success(`Claimed @${(data as { username: string }).username}`);
      setUsername("");
      setTargetUserId("");
      setNotes("");
      loadAudit();
      loadCounts();
    } catch (e) {
      toast.error(`Claim failed: ${friendlyError((e as Error).message)}`);
    } finally {
      setClaiming(false);
    }
  };

  return (
    <AppShell title="RESERVED USERNAMES">
      <div className="px-4 py-4 space-y-4 max-w-3xl mx-auto">
        <header className="space-y-1">
          <h1 className="font-display text-2xl text-gold flex items-center gap-2">
            <ShieldCheck size={20} /> Reserved Usernames
          </h1>
          <p className="text-xs text-muted-foreground">
            15,000-row reservation dataset. Seed the table and manage verified claims.
          </p>
          {counts && (
            <p className="text-[11px] text-muted-foreground">
              <span className="text-primary font-semibold">{counts.total.toLocaleString()}</span> reserved ·{" "}
              <span className="text-primary font-semibold">{counts.claimed.toLocaleString()}</span> claimed
            </p>
          )}
        </header>

        {/* Seed */}
        <section className="royal-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Database size={16} className="text-primary" />
            <h2 className="font-display text-base">Seed 15k dataset</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Idempotent upsert in chunks of 1,000 rows. Existing profile-username conflicts are returned for review.
          </p>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="accent-primary"
            />
            Dry run (parse only, no writes)
          </label>
          <Button onClick={runSeed} disabled={seeding} className="w-full sm:w-auto">
            {seeding ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
            {dryRun ? "Preview seed" : "Run seed"}
          </Button>
          {seedResult && (
            <pre className="bg-muted/40 rounded-lg p-3 text-[11px] overflow-x-auto whitespace-pre-wrap break-words">
              {JSON.stringify(seedResult, null, 2)}
            </pre>
          )}
        </section>

        {/* Claim */}
        <section className="royal-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <UserCheck size={16} className="text-primary" />
            <h2 className="font-display text-base">Assign reserved username</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Grants a reserved handle to a verified user. Blocked reservations cannot be assigned.
          </p>
          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="ru-username" className="text-xs">Reserved username</Label>
              <Input
                id="ru-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="paris"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ru-target" className="text-xs">Target user ID (auth.users.id)</Label>
              <Input
                id="ru-target"
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ru-notes" className="text-xs">Evidence / notes (optional)</Label>
              <Textarea
                id="ru-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Trademark cert #… / verified account confirmation…"
                rows={3}
              />
            </div>
          </div>
          <Button onClick={runClaim} disabled={claiming} className="w-full sm:w-auto">
            {claiming ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
            Assign username
          </Button>
        </section>

        {/* Audit */}
        <section className="royal-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <ClipboardList size={16} className="text-primary" />
            <h2 className="font-display text-base">Recent audit log</h2>
          </div>
          {!audit.length && (
            <p className="text-xs text-muted-foreground py-4 text-center">No entries yet.</p>
          )}
          <ul className="divide-y divide-border/50">
            {audit.map((a) => (
              <li key={a.id} className="py-2 text-xs space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    <span className="text-primary">{a.action}</span> · @{a.username}
                  </span>
                  <span className="text-muted-foreground text-[10px]">{timeAgo(a.created_at)}</span>
                </div>
                {a.target_user_id && (
                  <div className="text-muted-foreground">target: {a.target_user_id.slice(0, 8)}…</div>
                )}
                {a.evidence_notes && (
                  <div className="text-muted-foreground italic break-words">{a.evidence_notes}</div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
