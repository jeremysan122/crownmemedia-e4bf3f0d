import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Gift } from "lucide-react";
import { toast } from "sonner";

/**
 * Admin tool: comp N days of Royal Pass to any user, with an audit log entry.
 * Backed by admin_grant_royal_pass(_target_user_id, _days, _reason).
 */
export default function ManualGrantRoyalPass() {
  const [userId, setUserId] = useState("");
  const [days, setDays] = useState("30");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const _uid = userId.trim();
    const _days = parseInt(days, 10);
    const _reason = reason.trim();
    if (!_uid) return toast.error("User id required");
    if (!Number.isFinite(_days) || _days <= 0) return toast.error("Days must be positive");
    if (_reason.length < 3) return toast.error("Reason must be at least 3 characters");

    setBusy(true);
    const t = toast.loading(`Granting ${_days} days…`);
    try {
      const { data, error } = await (supabase as any).rpc("admin_grant_royal_pass", {
        _target_user_id: _uid,
        _days,
        _reason,
      });
      if (error) throw error;
      const res = data as { ok?: boolean; new_period_end?: string };
      toast.success(
        res?.new_period_end
          ? `Granted · expires ${new Date(res.new_period_end).toLocaleDateString()}`
          : "Granted",
        { id: t },
      );
      setUserId("");
      setReason("");
    } catch (e: any) {
      toast.error(e?.message ?? "Grant failed", { id: t });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-admin-only="royal-pass-manual-grant"
      className="rounded-lg border-2 border-dashed border-gold/40 p-4 space-y-2 bg-background/40"
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-gold font-bold">
        <Gift size={12} /> Manual Royal Pass grant
      </div>
      <p className="text-[11px] text-muted-foreground">
        Comp Royal Pass access to a user. Extends existing period end when active. Audited.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_100px] gap-2">
        <Input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="target user id (uuid)"
          className="h-8 text-[11px]"
        />
        <Input
          value={days}
          onChange={(e) => setDays(e.target.value)}
          placeholder="days"
          inputMode="numeric"
          className="h-8 text-[11px]"
        />
      </div>
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="reason (audit log, min 3 chars)"
        className="h-8 text-[11px]"
      />
      <Button
        onClick={submit}
        disabled={busy}
        variant="outline"
        className="w-full border-gold/40 text-gold hover:bg-gold/10"
      >
        {busy ? <Loader2 size={14} className="animate-spin mr-2" /> : <Gift size={14} className="mr-2" />}
        Grant Royal Pass
      </Button>
    </div>
  );
}
