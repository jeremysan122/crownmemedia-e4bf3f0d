// Inline debounced search results for the Discover search bar.
//
// Users can type free text, `@username`, or `#tag`. We fan out to the
// obvious sources (profiles, posts, main_categories, subcategories) with
// small limits and render a compact suggestion list. Row clicks navigate
// to the canonical destination (profile / post / category hub).
//
// All errors surface as a friendly "Couldn't search" line — raw Postgres/
// RLS messages never render.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Hash, AtSign, Crown, Search as SearchIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface UserHit  { id: string; username: string; display_name: string | null; profile_photo_url: string | null; }
interface PostHit  { id: string; caption: string | null; image_url: string | null; image_urls: string[] | null; video_poster_url: string | null; profile: { username: string | null } | null; }
interface HubHit   { slug: string; label: string; kind: "hub"; }
interface TopicHit { slug: string; label: string; mainSlug: string | null; kind: "topic"; }

type Kind = "text" | "user" | "tag";

function kindOf(q: string): Kind {
  if (q.startsWith("@")) return "user";
  if (q.startsWith("#")) return "tag";
  return "text";
}

interface Props {
  query: string;
  onNavigate?: () => void;
}

export default function DiscoverSearchResults({ query, onNavigate }: Props) {
  const raw = query.trim();
  const term = raw.replace(/^[#@]/, "");
  const kind = kindOf(raw);

  const [users, setUsers] = useState<UserHit[]>([]);
  const [posts, setPosts] = useState<PostHit[]>([]);
  const [hubs, setHubs] = useState<HubHit[]>([]);
  const [topics, setTopics] = useState<TopicHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    if (term.length < 2) {
      setUsers([]); setPosts([]); setHubs([]); setTopics([]);
      setLoading(false); setError(false);
      return;
    }
    const id = ++reqId.current;
    const like = `%${term.replace(/[%_]/g, (m) => "\\" + m)}%`;
    setLoading(true); setError(false);
    const t = setTimeout(async () => {
      try {
        const tasks: Array<PromiseLike<any>> = [];
        // Users (username / display_name) — skip when a tag is being typed.
        tasks.push(
          kind === "tag"
            ? Promise.resolve({ data: [] })
            : supabase
                .from("profiles")
                .select("id, username, display_name, profile_photo_url")
                .or(`username.ilike.${like},display_name.ilike.${like}`)
                .eq("is_banned", false)
                .limit(6),
        );
        // Posts — by caption OR hashtag array containment. Excludes removed/archived.
        tasks.push(
          kind === "user"
            ? Promise.resolve({ data: [] })
            : (kind === "tag"
                ? supabase
                    .from("posts")
                    .select("id, caption, image_url, image_urls, video_poster_url, profile:profiles!posts_user_id_fkey(username)")
                    .contains("hashtags", [term.toLowerCase()])
                    .eq("is_removed", false)
                    .eq("is_archived", false)
                    .order("crown_score", { ascending: false })
                    .limit(6)
                : supabase
                    .from("posts")
                    .select("id, caption, image_url, image_urls, video_poster_url, profile:profiles!posts_user_id_fkey(username)")
                    .ilike("caption", like)
                    .eq("is_removed", false)
                    .eq("is_archived", false)
                    .order("crown_score", { ascending: false })
                    .limit(6)),
        );
        // Hubs & topics — only for free-text searches.
        tasks.push(
          kind === "text"
            ? supabase.from("main_categories").select("slug, label").ilike("label", like).limit(4)
            : Promise.resolve({ data: [] }),
        );
        tasks.push(
          kind === "text"
            ? supabase
                .from("subcategories")
                .select("slug, label, main_category:main_categories(slug)")
                .ilike("label", like)
                .limit(4)
            : Promise.resolve({ data: [] }),
        );

        const [uRes, pRes, hRes, tRes] = await Promise.all(tasks);
        if (id !== reqId.current) return;
        // Any individual failure → friendly empty section, not raw error.
        setUsers(((uRes?.data as any[]) || []) as UserHit[]);
        setPosts(((pRes?.data as any[]) || []) as PostHit[]);
        setHubs(((hRes?.data as any[]) || []).map((r) => ({ ...r, kind: "hub" as const })));
        setTopics(((tRes?.data as any[]) || []).map((r) => ({
          slug: r.slug,
          label: r.label,
          mainSlug: r.main_category?.slug ?? null,
          kind: "topic" as const,
        })));
      } catch {
        if (id !== reqId.current) return;
        setError(true);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [term, kind]);

  const empty = useMemo(
    () => !loading && users.length === 0 && posts.length === 0 && hubs.length === 0 && topics.length === 0,
    [loading, users, posts, hubs, topics],
  );

  if (term.length < 2) return null;

  return (
    <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl border border-border bg-popover shadow-xl overflow-hidden max-h-[70vh] overflow-y-auto">
      {loading && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" />Searching…
        </div>
      )}
      {error && (
        <div className="px-3 py-2 text-xs text-muted-foreground">Couldn't search right now. Try again.</div>
      )}
      {!loading && !error && empty && (
        <div className="px-3 py-3 text-xs text-muted-foreground flex items-center gap-2">
          <SearchIcon size={12} />No results for "{term}".
        </div>
      )}

      {users.length > 0 && (
        <div className="py-1">
          <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-muted-foreground font-bold">People</p>
          {users.map((u) => (
            <Link
              key={u.id}
              to={`/profile/${u.username}`}
              onClick={onNavigate}
              className="flex items-center gap-2 px-3 py-2 hover:bg-secondary/50 transition"
            >
              <div className="size-7 rounded-full bg-muted overflow-hidden">
                {u.profile_photo_url && <img src={u.profile_photo_url} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold truncate">@{u.username}</p>
                {u.display_name && <p className="text-[10px] text-muted-foreground truncate">{u.display_name}</p>}
              </div>
              <AtSign size={12} className="text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}

      {posts.length > 0 && (
        <div className="py-1 border-t border-border/50">
          <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            {kind === "tag" ? `Posts tagged #${term}` : "Posts"}
          </p>
          {posts.map((p) => {
            const cover = p.image_urls?.[0] ?? p.image_url ?? p.video_poster_url ?? null;
            return (
              <Link
                key={p.id}
                to={`/post/${p.id}`}
                onClick={onNavigate}
                className="flex items-center gap-2 px-3 py-2 hover:bg-secondary/50 transition"
              >
                <div className="size-9 rounded-md bg-muted overflow-hidden shrink-0">
                  {cover && <img src={cover} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs truncate">{p.caption || "(no caption)"}</p>
                  <p className="text-[10px] text-muted-foreground truncate">@{p.profile?.username ?? "unknown"}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {hubs.length > 0 && (
        <div className="py-1 border-t border-border/50">
          <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Hubs</p>
          {hubs.map((h) => (
            <Link
              key={h.slug}
              to={`/discover?hub=${h.slug}`}
              onClick={onNavigate}
              className="flex items-center gap-2 px-3 py-2 hover:bg-secondary/50 transition"
            >
              <Crown size={12} className="text-gold" fill="currentColor" />
              <span className="text-xs font-bold">{h.label}</span>
            </Link>
          ))}
        </div>
      )}

      {topics.length > 0 && (
        <div className="py-1 border-t border-border/50">
          <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Topics</p>
          {topics.map((t) => (
            <Link
              key={t.slug}
              to={t.mainSlug ? `/c/${t.mainSlug}/${t.slug}` : `/discover`}
              onClick={onNavigate}
              className="flex items-center gap-2 px-3 py-2 hover:bg-secondary/50 transition"
            >
              <Hash size={12} className="text-muted-foreground" />
              <span className="text-xs font-bold">{t.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
