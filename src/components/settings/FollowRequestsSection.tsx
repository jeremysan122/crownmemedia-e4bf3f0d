import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { respondToFollowRequest } from "@/lib/follows";
import { logRawError } from "@/lib/settingsSecurityErrors";
import { toast } from "sonner";

type RequestRow = {
  id: string;
  requester_id: string;
  created_at: string;
  profile?: {
    username: string;
    profile_photo_url: string | null;
  };
};

export default function FollowRequestsSection() {
  const { user } = useAuth();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("follow_requests")
      .select("id, requester_id, created_at")
      .eq("target_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      logRawError(error, "privacy", { feature: "follow_requests_load" });
      return;
    }
    const requestRows = (data ?? []) as RequestRow[];
    const ids = requestRows.map((row) => row.requester_id);
    if (!ids.length) { setRows([]); return; }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, profile_photo_url")
      .in("id", ids);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    setRows(requestRows.map((row) => ({ ...row, profile: byId.get(row.requester_id) })));
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const respond = async (row: RequestRow, accept: boolean) => {
    if (busy.has(row.id)) return;
    setBusy((current) => new Set(current).add(row.id));
    try {
      await respondToFollowRequest(row.id, accept);
      setRows((current) => current.filter((item) => item.id !== row.id));
      toast.success(accept ? "Follow request approved" : "Follow request declined");
    } catch (error) {
      logRawError(error, "privacy", { feature: "follow_request_respond", request_id: row.id });
      toast.error("Couldn't update this follow request");
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(row.id);
        return next;
      });
    }
  };

  if (rows.length === 0) return null;

  return (
    <div className="space-y-2 border-t border-border/40 pt-3">
      <div className="flex items-center gap-2">
        <UserPlus size={16} className="text-primary" />
        <div className="text-sm font-semibold">Follow requests</div>
        <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
          {rows.length}
        </span>
      </div>
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-2 rounded-lg bg-muted/30 p-2">
          <Link to={`/${row.profile?.username ?? ""}`} className="flex min-w-0 flex-1 items-center gap-2">
            <div className="size-9 shrink-0 overflow-hidden rounded-full bg-muted">
              {row.profile?.profile_photo_url && (
                <img src={row.profile.profile_photo_url} alt="" className="size-full object-cover" />
              )}
            </div>
            <span className="truncate text-sm font-semibold">@{row.profile?.username ?? "user"}</span>
          </Link>
          <Button
            size="icon"
            className="size-8"
            disabled={busy.has(row.id)}
            aria-label={`Approve @${row.profile?.username ?? "user"}`}
            onClick={() => void respond(row, true)}
          >
            <Check size={14} />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            disabled={busy.has(row.id)}
            aria-label={`Decline @${row.profile?.username ?? "user"}`}
            onClick={() => void respond(row, false)}
          >
            <X size={14} />
          </Button>
        </div>
      ))}
    </div>
  );
}
