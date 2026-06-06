// Restricted Accounts — a soft-block list. The target user isn't notified;
// downstream readers should hide their interactions from notifications and
// gate their comments behind a "see comment" tap.

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X } from "lucide-react";

type Row = {
  id: string;
  target_user_id: string;
  profile: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
};

export default function RestrictedAccounts() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);

  const load = async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("restricted_users" as any)
      .select("id, target_user_id, profile:profiles!restricted_users_target_user_id_fkey(username, display_name, avatar_url)")
      .eq("user_id", user.id);
    if (error) {
      // Fallback without join if FK relationship not auto-detected.
      const { data: d2 } = await supabase
        .from("restricted_users" as any)
        .select("id, target_user_id")
        .eq("user_id", user.id);
      const ids = (d2 as any[] | null)?.map((r) => r.target_user_id) ?? [];
      if (ids.length === 0) { setRows([]); return; }
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", ids);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      setRows((d2 as any[] ?? []).map((r) => ({
        id: r.id, target_user_id: r.target_user_id,
        profile: map.get(r.target_user_id) ?? null,
      })));
      return;
    }
    setRows((data as any[] ?? []) as Row[]);
  };

  useEffect(() => { load();   }, [user?.id]);

  const remove = async (id: string) => {
    const { error } = await supabase.from("restricted_users" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
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

        {rows.length === 0 ? (
          <div className="royal-card p-6 text-center text-sm text-muted-foreground">
            No restricted accounts. Use the menu on someone's profile to restrict them.
          </div>
        ) : (
          <ul className="royal-card divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 p-3">
                <div className="size-10 rounded-full bg-muted overflow-hidden shrink-0">
                  {r.profile?.avatar_url && (
                    <img loading="lazy" src={r.profile.avatar_url} alt="" className="size-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{r.profile?.display_name || r.profile?.username || "User"}</div>
                  {r.profile?.username && <div className="text-[11px] text-muted-foreground truncate">@{r.profile.username}</div>}
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
