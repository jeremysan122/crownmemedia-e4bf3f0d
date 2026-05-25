import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, EmptyState, PillBadge } from "@/components/admin/cc/CommandCenterUI";
import ExportDiagnosticsButton from "@/components/admin/cc/ExportDiagnosticsButton";

interface Loaded<T> { data: T[]; error: string | null; }

const empty = <T,>(): Loaded<T> => ({ data: [], error: null });

export default function CommandCenterRealtime() {
  const [posts, setPosts] = useState<Loaded<any>>(empty());
  const [comments, setComments] = useState<Loaded<any>>(empty());
  const [votes, setVotes] = useState<Loaded<any>>(empty());

  useEffect(() => {
    const load = async () => {
      const since = new Date(Date.now() - 30 * 60_000).toISOString();
      const [p, c, v] = await Promise.allSettled([
        supabase.from("posts").select("id, caption, category, city, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(20),
        supabase.from("comments").select("id, body, post_id, user_id, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(20),
        supabase.from("votes").select("id, vote_type, post_id, user_id, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(20),
      ]);
      const unwrap = <T,>(s: PromiseSettledResult<any>): Loaded<T> => {
        if (s.status === "rejected") return { data: [], error: s.reason?.message ?? "Query failed" };
        if (s.value?.error) return { data: [], error: s.value.error.message };
        return { data: s.value?.data ?? [], error: null };
      };
      setPosts(unwrap(p));
      setComments(unwrap(c));
      setVotes(unwrap(v));
    };
    load();
    const ch = supabase
      .channel("cc-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "votes" }, load)
      .subscribe();
    const t = window.setInterval(load, 15_000);
    return () => {
      supabase.removeChannel(ch);
      window.clearInterval(t);
    };
  }, []);

  const ErrLine = ({ msg }: { msg: string }) => (
    <div className="text-[11px] text-rose-300">Couldn't load: {msg}</div>
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ExportDiagnosticsButton
          name="realtime"
          sections={[
            { label: "Live posts (30m)", filename: "posts", rows: posts.data },
            { label: "Live comments (30m)", filename: "comments", rows: comments.data },
            { label: "Live votes (30m)", filename: "votes", rows: votes.data },
          ]}
        />
      </div>
      <SectionCard title={`Live Posts (last 30m · ${posts.data.length})`}>
        {posts.error ? <ErrLine msg={posts.error} />
          : posts.data.length === 0 ? <EmptyState message="No new posts in the last 30 minutes." /> : (
          <ul className="divide-y divide-border/40 text-xs">
            {posts.data.map((p) => (
              <li key={p.id} className="py-1.5 flex items-center gap-2">
                <PillBadge>{p.category}</PillBadge>
                <span className="flex-1 truncate">{p.caption || "(no caption)"}</span>
                <span className="text-muted-foreground text-[10px]">{p.city || "—"} · {new Date(p.created_at).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={`Live Comments (last 30m · ${comments.data.length})`}>
        {comments.error ? <ErrLine msg={comments.error} />
          : comments.data.length === 0 ? <EmptyState message="No new comments." /> : (
          <ul className="divide-y divide-border/40 text-xs">
            {comments.data.map((c) => (
              <li key={c.id} className="py-1.5 flex gap-2">
                <span className="flex-1 line-clamp-2">{c.body}</span>
                <span className="text-muted-foreground text-[10px]">{new Date(c.created_at).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={`Live Votes (last 30m · ${votes.data.length})`}>
        {votes.error ? <ErrLine msg={votes.error} />
          : votes.data.length === 0 ? <EmptyState message="No votes yet." /> : (
          <ul className="divide-y divide-border/40 text-xs">
            {votes.data.map((v) => (
              <li key={v.id} className="py-1.5 flex items-center gap-2">
                <PillBadge tone={v.vote_type === "diamond" ? "good" : "default"}>{v.vote_type}</PillBadge>
                <span className="flex-1 truncate text-muted-foreground">post {String(v.post_id ?? "").slice(0, 8)}…</span>
                <span className="text-muted-foreground text-[10px]">{new Date(v.created_at).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
