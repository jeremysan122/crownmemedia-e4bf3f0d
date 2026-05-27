import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Pause, Play, Trash2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function AccountDangerZone() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const [state, setState] = useState<{ deactivated_at: string | null; deletion_requested_at: string | null } | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .rpc("get_my_profile")
      .maybeSingle()
      .then(({ data }) => data && setState({
        deactivated_at: (data as any).deactivated_at ?? null,
        deletion_requested_at: (data as any).deletion_requested_at ?? null,
      }));
  }, [user?.id]);

  const isDeactivated = !!state?.deactivated_at;
  const isPendingDeletion = !!state?.deletion_requested_at;
  const finalDeleteAt = state?.deletion_requested_at
    ? new Date(new Date(state.deletion_requested_at).getTime() + 30 * 86400000)
    : null;

  const refetch = async () => {
    if (!user?.id) return;
    const { data } = await supabase.rpc("get_my_profile").maybeSingle();
    setState(data ? {
      deactivated_at: (data as any).deactivated_at ?? null,
      deletion_requested_at: (data as any).deletion_requested_at ?? null,
    } : null);
  };

  const onDeactivate = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("deactivate_my_account" as any);
    setBusy(false);
    setConfirmDeactivate(false);
    if (error) return toast.error(error.message);
    toast.success("Account deactivated. Sign in again to reactivate.");
    await signOut();
    nav("/", { replace: true });
  };

  const onReactivate = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("reactivate_my_account" as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back — your account is active.");
    refetch();
  };

  const onRequestDelete = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("request_account_deletion" as any);
    setBusy(false);
    setConfirmDelete(false);
    if (error) return toast.error(error.message);
    toast.success("Deletion scheduled in 30 days. Cancel anytime before then.");
    refetch();
  };

  const onCancelDeletion = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("cancel_account_deletion" as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Deletion cancelled.");
    refetch();
  };

  return (
    <section className="royal-card p-4 space-y-3">
      <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground flex items-center gap-2">
        <ShieldAlert size={14} className="text-destructive" /> Account
      </h2>

      {isPendingDeletion && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
          <div className="flex items-center gap-2 font-bold text-destructive mb-1">
            <AlertTriangle size={13} /> Deletion scheduled
          </div>
          <p className="text-muted-foreground">
            Your account will be permanently deleted on{" "}
            <span className="font-semibold text-foreground">
              {finalDeleteAt?.toLocaleDateString()}
            </span>
            . You can cancel anytime before then.
          </p>
          <Button size="sm" variant="outline" className="mt-2" onClick={onCancelDeletion} disabled={busy}>
            Cancel deletion
          </Button>
        </div>
      )}

      {!isPendingDeletion && (
        <>
          <div className="flex items-center gap-3 py-1.5">
            {isDeactivated ? <Play size={18} className="text-muted-foreground" /> : <Pause size={18} className="text-muted-foreground" />}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">
                {isDeactivated ? "Reactivate account" : "Deactivate account"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {isDeactivated
                  ? "Your profile is hidden. Reactivate to bring it back."
                  : "Hide your profile and posts. You can come back anytime."}
              </div>
            </div>
            {isDeactivated ? (
              <Button size="sm" variant="outline" onClick={onReactivate} disabled={busy}>Reactivate</Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirmDeactivate(true)} disabled={busy}>Deactivate</Button>
            )}
          </div>

          <div className="flex items-center gap-3 py-1.5 border-t border-border/40 pt-3">
            <Trash2 size={18} className="text-destructive" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-destructive">Delete account</div>
              <div className="text-[11px] text-muted-foreground">
                30-day grace period. Reversible until the date above.
              </div>
            </div>
            <Button size="sm" variant="outline" className="border-destructive/40 text-destructive" onClick={() => setConfirmDelete(true)} disabled={busy}>
              Delete
            </Button>
          </div>
        </>
      )}

      <AlertDialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Your profile, posts and crowns will be hidden. You'll be signed out and can reactivate anytime by signing back in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDeactivate}>Deactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account in 30 days?</AlertDialogTitle>
            <AlertDialogDescription>
              Your account will be hidden immediately and permanently deleted after 30 days.
              You can cancel anytime in Settings before that.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onRequestDelete} className="bg-destructive hover:bg-destructive/90">
              Schedule deletion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
