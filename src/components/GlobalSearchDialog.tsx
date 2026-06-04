import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { supabase } from "@/integrations/supabase/client";
import { Search, Crown, Hash, MapPin, User, Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchMainCategories, fetchSubcategories, type MainCategory, type Subcategory } from "@/lib/categories";

interface UserHit {
  id: string;
  username: string;
  profile_photo_url: string | null;
  crowns_held: number;
  city: string | null;
  country: string | null;
}

interface PostHit {
  id: string;
  image_url: string;
  caption: string | null;
  category: string;
}

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
}

export default function GlobalSearchDialog({ open, onOpenChange }: Props) {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<UserHit[]>([]);
  const [posts, setPosts] = useState<PostHit[]>([]);
  const [mains, setMains] = useState<MainCategory[]>([]);
  const [subs, setSubs] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    fetchMainCategories().then(setMains);
    fetchSubcategories().then(setSubs);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQ("");
      setUsers([]);
      setPosts([]);
    }
  }, [open]);

  useEffect(() => {
    const term = q.trim();

    if (term.length < 2) {
      setUsers([]);
      setPosts([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const t = setTimeout(async () => {
      const [{ data: u, error: uErr }, { data: p, error: pErr }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, profile_photo_url, crowns_held, city, country")
          .or(`username.ilike.%${term}%,city.ilike.%${term}%,country.ilike.%${term}%`)
          .limit(8),

        supabase
          .from("posts")
          .select("id, image_url, caption, category")
          .eq("is_removed", false)
          .or(`caption.ilike.%${term}%,city.ilike.%${term}%,country.ilike.%${term}%`)
          .limit(6),
      ]);

      if (cancelled) return;

      if (uErr || pErr) {
        console.warn("Search error", { uErr, pErr });
        setUsers([]);
        setPosts([]);
      } else {
        setUsers((u as any) || []);
        setPosts((p as any) || []);
      }

      setLoading(false);
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const go = (path: string) => {
    onOpenChange(false);
    nav(path);
  };

  const term = q.trim().toLowerCase();

  // Category/topic matches (Phase 4)
  const matchedHubs = useMemo(() => {
    if (term.length < 2) return [];
    return mains
      .filter((m) => m.label.toLowerCase().includes(term) || m.slug.includes(term))
      .slice(0, 4);
  }, [term, mains]);

  const matchedTopics = useMemo(() => {
    if (term.length < 2) return [];
    return subs
      .filter((s) => s.label.toLowerCase().includes(term) || s.slug.includes(term))
      .slice(0, 6);
  }, [term, subs]);

  const subToMain = (s: Subcategory) => mains.find((m) => m.id === s.main_category_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden">
        <VisuallyHidden>
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>Search users, hubs, topics, and places.</DialogDescription>
        </VisuallyHidden>
        <div className="flex items-center gap-2 px-4 h-14 border-b border-border">
          <Search size={18} className="text-muted-foreground shrink-0" />

          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search royals, hubs, topics, cities…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/70"
          />
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {q.trim().length < 2 && (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              Type at least 2 characters to search.
            </div>
          )}

          {q.trim().length >= 2 &&
            !loading &&
            users.length === 0 &&
            posts.length === 0 &&
            matchedHubs.length === 0 &&
            matchedTopics.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                No matches for "{q}".
              </div>
            )}

          {matchedHubs.length > 0 && (
            <Section title="Categories">
              {matchedHubs.map((m) => (
                <div key={m.id} className="flex items-stretch">
                  <button
                    onClick={() => go(`/c/${m.slug}`)}
                    className="flex-1 flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 text-left"
                  >
                    <div className="size-8 rounded-full bg-muted flex items-center justify-center text-base">
                      {m.icon ?? "🏷️"}
                    </div>
                    <span className="text-sm font-semibold">{m.label}</span>
                  </button>
                  <button
                    onClick={() => go(`/leaderboard/c/${m.slug}`)}
                    title={`${m.label} leaderboard`}
                    className="px-3 hover:bg-muted/50 text-muted-foreground"
                  >
                    <Trophy size={14} />
                  </button>
                </div>
              ))}
            </Section>
          )}

          {matchedTopics.length > 0 && (
            <Section title="Topics">
              {matchedTopics.map((s) => {
                const m = subToMain(s);
                if (!m) return null;
                return (
                  <div key={s.id} className="flex items-stretch">
                    <button
                      onClick={() => go(`/c/${m.slug}/${s.slug}`)}
                      className="flex-1 flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 text-left"
                    >
                      <div className="size-8 rounded-full bg-muted flex items-center justify-center">
                        <Hash size={14} className="text-muted-foreground" />
                      </div>
                      <span className="text-sm">
                        {s.label}
                        <span className="text-muted-foreground text-[11px]"> · {m.label}</span>
                      </span>
                    </button>
                    <button
                      onClick={() => go(`/leaderboard/c/${m.slug}?topic=${s.slug}`)}
                      title="Leaderboard"
                      className="px-3 hover:bg-muted/50 text-muted-foreground"
                    >
                      <Trophy size={14} />
                    </button>
                  </div>
                );
              })}
            </Section>
          )}

          {users.length > 0 && (
            <Section title="Royals">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => go(`/u/${u.username}`)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 text-left"
                >
                  <div className="size-9 rounded-full overflow-hidden bg-muted shrink-0">
                    {u.profile_photo_url ? (
                      <img
                        src={u.profile_photo_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                        <User size={14} />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">@{u.username}</p>

                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      {(u.city || u.country) && (
                        <>
                          <MapPin size={10} />
                          {[u.city, u.country].filter(Boolean).join(", ")}
                        </>
                      )}
                    </p>
                  </div>

                  {u.crowns_held > 0 && (
                    <span className="text-[10px] flex items-center gap-1 text-primary font-bold">
                      <Crown size={10} fill="currentColor" /> {u.crowns_held}
                    </span>
                  )}
                </button>
              ))}
            </Section>
          )}

          {posts.length > 0 && (
            <Section title="Posts">
              <div className="grid grid-cols-3 gap-1 p-2">
                {posts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => go(`/post/${p.id}`)}
                    className="aspect-square bg-muted rounded-md overflow-hidden"
                  >
                    <img loading="lazy" src={p.image_url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </Section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
        {title}
      </div>
      {children}
    </div>
  );
}
