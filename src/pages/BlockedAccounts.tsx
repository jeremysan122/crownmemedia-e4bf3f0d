import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, Ban, UserCheck, BellOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type BlockRow = {
  id: string;
  blocked_id: string;
  created_at: string;
  blocked: { username: string | null; profile_photo_url: string | null } | null;
};

export default function BlockedAccounts() {
  const { user } = useAuth();
  const [rows, setRows] = useState<BlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<BlockRow | null>(null);
  const [muteAllOpen, setMuteAllOpen] = useState(false);
  const [muteAllBusy, setMuteAllBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("blocks")
      .select("id, blocked_id, created_at")
      .eq("blocker_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Couldn't load blocks", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const list = (data as any[]) || [];
    const ids = Array.from(new Set(list.map((r) => r.blocked_id)));
    const profiles: Record<string, any> = {};
    if (ids.length) {
      const { data: pData } = await supabase
        .from("profiles")
        .select("id, username, profile_photo_url")
        .in("id", ids);
      (pData as any[] || []).forEach((p) => { profiles[p.id] = p; });
    }
    setRows(list.map((r) => ({ ...r, blocked: profiles[r.blocked_id] ?? null })) as BlockRow[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const unblock = async (row: BlockRow) => {
    if (!user) return;
    setBusy(row.id);
    const { error } = await supabase
      .from("blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", row.blocked_id);
    setBusy(null);
    if (error) {
      toast({ title: "Couldn't unblock", description: error.message, variant: "destructive" });
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    toast({ title: `Unblocked @${row.blocked?.username ?? "user"}` });
  };

  const muteAllBlocked = async () => {
    if (!user || rows.length === 0) return;
    setMuteAllBusy(true);
    const payload = rows.map((r) => ({ user_id: user.id, other_user_id: r.blocked_id }));
    // Upsert avoids duplicate-key errors when some are already muted.
    const { error } = await supabase
      .from("muted_dm_threads")
      .upsert(payload, { onConflict: "user_id,other_user_id", ignoreDuplicates: true });
    setMuteAllBusy(false);
    setMuteAllOpen(false);
    if (error) {
      toast({ title: "Couldn't mute all", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: `Muted ${rows.length} conversation${rows.length === 1 ? "" : "s"}`,
      description: "You won't get notifications from blocked users' threads.",
    });
  };

  return (
    <AppShell title="BLOCKED ACCOUNTS">
      <div className="px-4 py-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="font-display text-2xl text-gold flex items-center gap-2">
              <Ban size={20} /> Blocked Accounts
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Blocked users can't message you or react to your DMs. Unblocking is instant.
            </p>
          </div>
          {!loading && rows.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => setMuteAllOpen(true)}
              disabled={muteAllBusy}
              aria-label="Mute all blocked users' conversations"
            >
              {muteAllBusy ? <Loader2 size={14} className="animate-spin mr-1" /> : <BellOff size={14} className="mr-1" />}
              Mute all
            </Button>
          )}
        </div>

        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin opacity-60" size={20} />
          </div>
        )}

        {!loading && rows.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">
            You haven't blocked anyone.
          </p>
        )}

        {!loading && rows.map((row) => (
          <div key={row.id} className="royal-card p-3 flex items-center gap-3">
            <Link
              to={row.blocked?.username ? `/${row.blocked.username}` : "#"}
              className="size-10 rounded-full bg-muted overflow-hidden shrink-0"
            >
              {row.blocked?.profile_photo_url && (
                <img loading="lazy" src={row.blocked.profile_photo_url} className="w-full h-full object-cover" alt="" />
              )}
            </Link>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">@{row.blocked?.username ?? "unknown"}</p>
              <p className="text-[11px] text-muted-foreground">
                Blocked {new Date(row.created_at).toLocaleDateString()}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirming(row)}
              disabled={busy === row.id}
            >
              {busy === row.id ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} className="mr-1" />}
              Unblock
            </Button>
          </div>
        ))}
      </div>

      <AlertDialog open={!!confirming} onOpenChange={(o) => { if (!o) setConfirming(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Unblock @{confirming?.blocked?.username ?? "user"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They'll be able to message you and react to your DMs again. You can re-block them anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const row = confirming;
                setConfirming(null);
                if (row) await unblock(row);
              }}
            >
              Unblock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={muteAllOpen} onOpenChange={(o) => { if (!o && !muteAllBusy) setMuteAllOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mute all {rows.length} blocked conversation{rows.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You'll stop getting inbox notifications for any DM thread with a blocked user.
              You can unmute individual conversations from your inbox at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={muteAllBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={muteAllBlocked} disabled={muteAllBusy}>
              {muteAllBusy ? <Loader2 size={14} className="animate-spin mr-1" /> : <BellOff size={14} className="mr-1" />}
              Mute all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
