// Restricted Accounts — a soft-block list. The target user isn't notified;
// downstream readers should hide their interactions from notifications and
// gate their comments behind a "see comment" tap.
//
// Full downstream enforcement lands in v1.1 (labelled below).

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Loader2 } from "lucide-react";
import { toFriendlyMessage, logRawError } from "@/lib/settingsSecurityErrors";

type Row = {
  id: string;
  target_user_id: string;
  profile: { username: string | null; profile_photo_url: string | null } | null;
};

export default function RestrictedAccounts() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    setErrored(false);
    // Two-step read: restricted rows, then a batched profiles lookup using
    // CrownMe's actual public-safe columns (`username`, `profile_photo_url`).
    const { data: baseRows, error } = await supabase
      .from("restricted_users" as any)
      .select("id, target_user_id")
      .eq("user_id", user.id);
    if (error) {
      logRawError(error, "restricted");
      toast.error(toFriendlyMessage(error, "restricted"));
      setErrored(true);
      setLoading(false);
      return;
    }
    const ids = ((baseRows as any[] | null) ?? []).map((r) => r.target_user_id);
    let profs: any[] = [];
    if (ids.length) {
      const { data: pData, error: pErr } = await supabase
        .from("profiles")
        .select("id, username, profile_photo_url")
        .in("id", ids);
      if (pErr) {
        logRawError(pErr, "restricted");
        // Non-fatal — we still render usernames as "user".
      }
      profs = (pData as any[] | null) ?? [];
    }
    const map = new Map(profs.map((p) => [p.id, p]));
    setRows(
      ((baseRows as any[]) ?? []).map((r) => ({
        id: r.id,
        target_user_id: r.target_user_id,
        profile: map.get(r.target_user_id) ?? null,
      })),
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const remove = async (id: string) => {
    const { error } = await supabase.from("restricted_users" as any).delete().eq("id", id);
    if (error) {
      logRawError(error, "restricted");
      toast.error(toFriendlyMessage(error, "restricted"));
      return;
    }
    setRows((r) => r.filter((x) => x.id !== id));
    toast.success("Removed restriction");
  };

  return (
    <AppShell title="RESTRICTED">
      <div className="px-4 py-4 space-y-4">
        <h1 className="font-display text-2xl text-gold">Restricted accounts</h1>
        <p className="text-[12px] text-muted-foreground">
          You'll stop seeing their notifications and their comments on your posts will be hidden by default. They won't be told.
        </p>
        <p className="text-[11px] text-amber-500">
          Full downstream enforcement (DMs, mentions, notifications) expands in v1.1.
        </p>

        {loading ? (
          <div className="royal-card p-6 flex justify-center">
            <Loader2 className="animate-spin opacity-60" size={20} />
          </div>
        ) : errored ? (
          <div className="royal-card p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">Couldn't load restricted accounts.</p>
            <button
              type="button"
              onClick={load}
              className="text-xs text-primary hover:underline"
            >
              Retry
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="royal-card p-6 text-center text-sm text-muted-foreground">
            No restricted accounts. Use the menu on someone's profile to restrict them.
          </div>
        ) : (
          <ul className="royal-card divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 p-3">
                <div className="size-10 rounded-full bg-muted overflow-hidden shrink-0">
                  {r.profile?.profile_photo_url && (
                    <img loading="lazy" src={r.profile.profile_photo_url} alt="" className="size-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {r.profile?.username ? `@${r.profile.username}` : "User"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  aria-label="Remove restriction"
                  className="size-8 rounded-full hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
