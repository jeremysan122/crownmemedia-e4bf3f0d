import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Navigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { timeAgo } from "@/lib/crown";
import { Flag, MessageSquare, Image as ImageIcon, User, Activity, ScrollText, CheckSquare, Package, Crown as CrownIcon, Swords, Shield, BadgeCheck, Megaphone, Users, Gift, AlertTriangle, FileCheck, FolderTree, LayoutDashboard } from "lucide-react";
import AdminSessionHint from "@/components/admin/AdminSessionHint";
import CrownRankingsWidget from "@/components/admin/CrownRankingsWidget";

interface ReportRow {
  id: string;
  created_at: string;
  reason: string;
  status: string;
  post_id: string | null;
  comment_id: string | null;
  reported_user_id: string | null;
  reporter_id: string;
  comment?: { body: string; user_id: string; profile?: { username: string } | null } | null;
  reporter?: { username: string } | null;
}

export default function Admin() {
  const { isModerator, loading } = useAuth();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [filter, setFilter] = useState<"open" | "resolved" | "dismissed">("open");

  const load = async () => {
    const { data } = await supabase
      .from("reports")
      .select(
        "id, created_at, reason, status, post_id, comment_id, reported_user_id, reporter_id, " +
        "comment:comments!reports_comment_id_fkey(body, user_id, profile:profiles!comments_user_id_fkey(username)), " +
        "reporter:profiles!reports_reporter_id_fkey(username)"
      )
      .eq("status", filter)
      .order("created_at", { ascending: false })
      .limit(100);
    setReports((data as unknown as ReportRow[]) || []);
  };
  useEffect(() => { if (isModerator) load(); }, [isModerator, filter]);

  if (loading) return <AppShell><div className="py-20 text-center">Loading...</div></AppShell>;
  if (!isModerator) return <Navigate to="/feed" replace />;

  const resolve = async (id: string, action: "remove" | "dismiss", r: ReportRow) => {
    if (action === "remove") {
      if (r.post_id) {
        await supabase.rpc("admin_set_post_removed" as never, { _post_id: r.post_id, _removed: true } as never);
      }
      if (r.comment_id) {
        await supabase.rpc("admin_moderate_comment" as never, { _comment_id: r.comment_id, _removed: true } as never);
      }
      if (r.reported_user_id) {
        await supabase.rpc("admin_set_profile_status", {
          _user_id: r.reported_user_id,
          _action: "suspend",
          _reason: "Moderation report action",
        });
      }
    }
    await supabase.from("reports").update({ status: action === "remove" ? "resolved" : "dismissed" }).eq("id", id);
    toast.success(action === "remove" ? "Removed" : "Dismissed");
    load();
  };

  return (
    <AppShell title="MODERATION">
      <div className="px-4 py-4 space-y-3">
        <AdminSessionHint />

        {/* Admin nav — organized sections */}
        <AdminSection title="Command Center">
          <AdminNav to="/admin/command-center" icon={<LayoutDashboard size={12} />} label="Command Center" />
        </AdminSection>

        <AdminSection title="Moderation & Safety">
          <AdminNav to="/admin/moderation" icon={<Shield size={12} />} label="Moderation Queue" />
          <AdminNav to="/admin/sensitive-appeals" icon={<AlertTriangle size={12} />} label="Sensitive Appeals" />
          <AdminNav to="/admin/audit-log" icon={<ScrollText size={12} />} label="Audit Log" />
        </AdminSection>

        <AdminSection title="Users & Creator Tools">
          <AdminNav to="/admin/verify" icon={<CheckSquare size={12} />} label="Verification" />
          <AdminNav to="/admin/verification" icon={<BadgeCheck size={12} />} label="Blue Check Review" />
          <AdminNav to="/admin/voting-verify" icon={<CrownIcon size={12} />} label="Voting Verify" />
          <AdminNav to="/admin/creator-program" icon={<Users size={12} />} label="Creator Program" />
        </AdminSection>

        <AdminSection title="Rewards & Monetization">
          <AdminNav to="/admin/rewards" icon={<Gift size={12} />} label="Rewards" />
          <AdminNav to="/admin/bundles" icon={<Package size={12} />} label="Bundles" />
          <AdminNav to="/admin/broadcast" icon={<Megaphone size={12} />} label="Broadcast" />
        </AdminSection>

        <AdminSection title="Content & Categories">
          <AdminNav to="/admin/categories" icon={<FolderTree size={12} />} label="Categories" />
          <AdminNav to="/admin/reserved-usernames" icon={<Shield size={12} />} label="Reserved Usernames" />
        </AdminSection>

        <AdminSection title="Compliance & System Health">
          <AdminNav to="/admin/compliance" icon={<FileCheck size={12} />} label="Compliance Check" />
          <AdminNav to="/admin/system-audit" icon={<Activity size={12} />} label="System Audit" />
          <AdminNav to="/admin/race-audit" icon={<Swords size={12} />} label="Race Audit" />
        </AdminSection>


        <CrownRankingsWidget />
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl text-gold flex items-center gap-2">
            <Flag size={20} /> Moderation Queue
          </h1>
          <div className="flex gap-1 text-[11px]">
            {(["open", "resolved", "dismissed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                  filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {reports.map((r) => {
          const kindIcon = r.comment_id ? <MessageSquare size={14} /> : r.post_id ? <ImageIcon size={14} /> : <User size={14} />;
          const kindLabel = r.comment_id ? "Comment" : r.post_id ? "Post" : "User";
          return (
            <div key={r.id} className="royal-card p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                  {kindIcon} {kindLabel}
                </span>
                <span className="text-[10px] text-muted-foreground">{timeAgo(r.created_at)}</span>
              </div>

              <p className="text-sm">
                <span className="text-muted-foreground">Reason: </span>{r.reason}
              </p>

              {r.comment?.body && (
                <div className="bg-muted/50 rounded-lg p-2 text-xs">
                  <div className="text-[10px] text-muted-foreground mb-0.5">
                    @{r.comment.profile?.username ?? "user"} wrote:
                  </div>
                  <p className="whitespace-pre-wrap break-words">{r.comment.body}</p>
                </div>
              )}

              <div className="text-[10px] text-muted-foreground space-y-0.5">
                <div>Reported by @{r.reporter?.username ?? r.reporter_id.slice(0, 8)}</div>
                {r.post_id && (
                  <div>
                    Post:{" "}
                    <Link to={`/post/${r.post_id}`} className="text-primary hover:underline">
                      {r.post_id.slice(0, 8)}
                    </Link>
                  </div>
                )}
              </div>

              {filter === "open" && (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="destructive" onClick={() => resolve(r.id, "remove", r)}>Remove</Button>
                  <Button size="sm" variant="outline" onClick={() => resolve(r.id, "dismiss", r)}>Dismiss</Button>
                </div>
              )}
            </div>
          );
        })}

        {!reports.length && (
          <p className="text-center text-sm text-muted-foreground py-10">
            No {filter} reports.
          </p>
        )}
      </div>
    </AppShell>
  );
}

function AdminNav({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="royal-card px-2.5 py-2 flex items-center gap-1.5 hover:bg-muted/30 transition"
    >
      <span className="text-primary">{icon}</span>
      <span className="font-semibold">{label}</span>
    </Link>
  );
}

function AdminSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5" aria-label={title}>
      <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground px-0.5">{title}</h2>
      <nav className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
        {children}
      </nav>
    </section>
  );
}
