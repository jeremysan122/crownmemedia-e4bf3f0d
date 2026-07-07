// Category Hub — /c/:mainSlug and /c/:mainSlug/:subSlug
//
// IMPORTANT: All React hooks live ABOVE any conditional return so the hook
// order is identical on every render. Previously `useMemo` calls for
// visiblePosts/top3/rest ran after `if (!main)` bailouts, which triggered
// "Rendered more hooks than during the previous render." on category
// navigation (e.g. /c/fashion-beauty right after mount).
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Crown, Flame, TrendingUp, Trophy, Swords, Medal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useFeedFilters, isFilteredOut } from "@/hooks/useFeedFilters";
import PostPreviewTile from "@/components/PostPreviewTile";
import {
  fetchMainCategories,
  fetchSubcategories,
  toggleCategoryFollow,
  type MainCategory,
  type Subcategory,
} from "@/lib/categories";

interface PostRow {
  id: string;
  user_id: string;
  image_url: string | null;
  image_urls: string[] | null;
  video_poster_url: string | null;
  media_type: string | null;
  content_type: string | null;
  aspect_ratio: string | null;
  filter: string | null;
  caption: string | null;
  crown_score: number;
  vote_count: number;
  is_sensitive?: boolean | null;
  hashtags?: string[] | null;
  main_category_slug: string | null;
  subcategory_slug: string | null;
  profile: { username: string; profile_photo_url: string | null } | null;
}
interface CrownRow {
  id: string;
  category: string;
  awarded_at: string;
  user: { username: string; profile_photo_url: string | null } | null;
}
interface BattleRow {
  id: string;
  status: string | null;
  ends_at: string | null;
  category: string | null;
}

const POST_PREVIEW_COLUMNS =
  "id, user_id, image_url, image_urls, video_poster_url, media_type, content_type, aspect_ratio, filter, caption, crown_score, vote_count, is_sensitive, hashtags, main_category_slug, subcategory_slug, profile:profiles!posts_user_id_fkey(username, profile_photo_url)";

export default function CategoryHub() {
  const { mainSlug, subSlug } = useParams();
  const { user } = useAuth();
  const filters = useFeedFilters();
  const [mains, setMains] = useState<MainCategory[]>([]);
  const [subs, setSubs] = useState<Subcategory[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [crowns, setCrowns] = useState<CrownRow[]>([]);
  const [battles, setBattles] = useState<BattleRow[]>([]);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchMainCategories(), fetchSubcategories()]).then(([m, s]) => {
      setMains(m); setSubs(s);
    });
  }, []);

  const main = useMemo(() => mains.find((m) => m.slug === mainSlug) ?? null, [mains, mainSlug]);
  const sub = useMemo(
    () => (subSlug ? subs.find((s) => s.slug === subSlug && s.main_category_id === main?.id) ?? null : null),
    [subs, subSlug, main]
  );
  const mainSubs = useMemo(
    () => (main ? subs.filter((s) => s.main_category_id === main.id) : []),
    [subs, main]
  );

  // Posts in this category — include full media/filter fields so previews render
  // through PostPreviewTile with the same look as Feed / Profile / PostDetail.
  useEffect(() => {
    if (!mainSlug) return;
    setLoading(true);
    (async () => {
      let q = supabase
        .from("posts")
        .select(POST_PREVIEW_COLUMNS)
        .eq("is_removed", false)
        .eq("is_archived", false)
        .order("crown_score", { ascending: false })
        .limit(50);
      if (sub) q = q.eq("subcategory_slug", sub.slug);
      else q = q.eq("main_category_slug", mainSlug);
      const { data } = await q;
      setPosts((data as any) || []);
      setLoading(false);
    })();
  }, [mainSlug, sub?.slug]);

  // Crowns scoped by legacy_enum of any sub in this hub (or the specific sub)
  useEffect(() => {
    if (!main) return;
    const legacyEnums = (sub ? [sub] : mainSubs)
      .map((s) => s.legacy_enum)
      .filter(Boolean) as string[];
    if (legacyEnums.length === 0) { setCrowns([]); return; }
    (async () => {
      const { data } = await supabase
        .from("crowns")
        .select("id, category, awarded_at, user:profiles!crowns_user_id_fkey(username, profile_photo_url)")
        .eq("active", true)
        .in("category", legacyEnums as any)
        .order("awarded_at", { ascending: false })
        .limit(10);
      setCrowns((data as any) || []);
    })();
  }, [main?.id, sub?.id, mainSubs.length]);

  useEffect(() => {
    if (!main) return;
    const legacyEnums = (sub ? [sub] : mainSubs)
      .map((s) => s.legacy_enum)
      .filter(Boolean) as string[];
    if (legacyEnums.length === 0) { setBattles([]); return; }
    (async () => {
      const { data, error } = await supabase
        .from("battles" as any)
        .select("id, status, ends_at, category")
        .in("category", legacyEnums as any)
        .eq("status", "active")
        .order("ends_at", { ascending: true })
        .limit(5);
      if (!error) setBattles((data as any) || []);
    })();
  }, [main?.id, sub?.id, mainSubs.length]);

  useEffect(() => {
    if (!user?.id || !main) return;
    (async () => {
      const { data } = await supabase
        .from("category_follows" as any)
        .select("id")
        .eq("user_id", user.id)
        .eq("state", "following")
        .eq(sub ? "subcategory_id" : "main_category_id", sub ? sub.id : main.id)
        .maybeSingle();
      setFollowing(!!data);
    })();
  }, [user?.id, main?.id, sub?.id]);

  // Derived values — kept above the early returns so hook order is stable.
  const visiblePosts = useMemo(
    () => posts.filter((p) => !isFilteredOut(p as any, filters)),
    [posts, filters]
  );
  const reignHolder = crowns[0]?.user ?? null;
  const top3 = visiblePosts.slice(0, 3);
  const rest = visiblePosts.slice(3);

  const onFollow = async () => {
    if (!user || !main) return;
    setFollowing((f) => !f);
    await toggleCategoryFollow({
      userId: user.id,
      mainCategoryId: sub ? null : main.id,
      subcategoryId: sub ? sub.id : null,
      state: "following",
    });
  };

  // ── Conditional returns MUST come after every hook above. ─────────────
  if (!main && mains.length > 0) {
    return (
      <main className="max-w-3xl mx-auto p-6 text-center">
        <h1 className="font-display text-2xl mb-2">Category not found</h1>
        <Link to="/discover" className="text-primary text-sm hover:underline">Browse all categories</Link>
      </main>
    );
  }
  if (!main) return <div className="p-6 text-muted-foreground text-sm">Loading…</div>;

  return (
    <main className="max-w-5xl mx-auto px-4 pb-24">
      {/* Hero */}
      <header className={`relative rounded-3xl overflow-hidden p-8 mt-4 mb-6 bg-gradient-to-br ${main.gradient ?? "from-amber-400 to-yellow-600"} text-white shadow-xl`}>
        <div className="absolute inset-0 bg-black/25" />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.3em] opacity-80 mb-1">Royal Hub</p>
          <h1 className="font-display text-4xl md:text-5xl mb-2">{main.label}</h1>
          {sub && <p className="text-xl font-semibold opacity-90 mb-2">→ {sub.label}</p>}
          {main.description && !sub && <p className="text-sm opacity-90 max-w-xl">{main.description}</p>}
          <div className="flex flex-wrap gap-2 mt-4">
            {/* Follow Category button — every state has explicit high-contrast
                colors so the label is always readable (previously the disabled
                signed-out state faded to white-on-white). */}
            {user ? (
              <button
                onClick={onFollow}
                className={`px-4 py-2 rounded-full text-xs font-bold backdrop-blur transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                  following
                    ? "bg-black/50 text-white ring-1 ring-white/70 hover:bg-black/60"
                    : "bg-white text-black hover:bg-white/90"
                }`}
              >
                {following ? "Following" : "Follow Category"}
              </button>
            ) : (
              <Link
                to={`/auth?next=${encodeURIComponent(`/c/${main.slug}${sub ? `/${sub.slug}` : ""}`)}`}
                className="px-4 py-2 rounded-full text-xs font-bold bg-white text-black hover:bg-white/90"
              >
                Sign in to follow
              </Link>
            )}
            <Link to={`/leaderboard/c/${main.slug}${sub ? `?topic=${sub.slug}` : ""}`}
              className="px-4 py-2 rounded-full text-xs font-bold bg-black/40 text-white hover:bg-black/50">
              <Crown size={12} className="inline mr-1.5" />Leaderboard
            </Link>
            <Link to={`/upload?main=${main.slug}${sub ? `&sub=${sub.slug}` : ""}`}
              className="px-4 py-2 rounded-full text-xs font-bold bg-black/40 text-white hover:bg-black/50">
              + Compete
            </Link>
          </div>
        </div>
      </header>

      {/* Subcategory nav */}
      {mainSubs.length > 0 && (
        <nav className="flex gap-2 overflow-x-auto scrollbar-none mb-6 pb-1">
          <Link
            to={`/c/${main.slug}`}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition ${
              !sub ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card/40 hover:border-primary/40"
            }`}
          >
            All
          </Link>
          {mainSubs.map((s) => (
            <Link
              key={s.id}
              to={`/c/${main.slug}/${s.slug}`}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition ${
                sub?.id === s.id ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card/40 hover:border-primary/40"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      )}

      {/* Crown Holder strip */}
      {reignHolder && (
        <section className="royal-card p-4 mb-6 flex items-center gap-4 border-gold/40">
          <div className="size-14 rounded-full bg-gradient-gold p-[2px]">
            <div className="size-full rounded-full bg-muted overflow-hidden">
              {reignHolder.profile_photo_url && (
                <img src={reignHolder.profile_photo_url} alt="" className="w-full h-full object-cover" />
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-gold font-bold">Reigning Crown Holder</p>
            <Link to={`/profile/${reignHolder.username}`} className="font-display text-lg hover:text-primary truncate block">
              @{reignHolder.username}
            </Link>
          </div>
          <Crown size={28} className="text-gold" fill="currentColor" />
        </section>
      )}

      {/* Top Competitors podium */}
      {top3.length > 0 && (
        <section className="mb-6">
          <h2 className="font-display text-lg mb-3 flex items-center gap-2">
            <Medal size={16} className="text-primary" />Top Competitors
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {top3.map((p, i) => (
              <PostPreviewTile
                key={p.id}
                post={p}
                className={i === 0 ? "ring-2 ring-gold/60" : ""}
                badge={
                  <div className={`absolute top-1.5 left-1.5 size-6 rounded-full flex items-center justify-center text-[10px] font-black z-10 ${
                    i === 0 ? "bg-gold text-black" : i === 1 ? "bg-slate-300 text-black" : "bg-amber-700 text-white"
                  }`}>
                    {i + 1}
                  </div>
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Active Battles + Recent Winners */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="royal-card p-4">
          <h2 className="font-display text-base mb-3 flex items-center gap-2">
            <Swords size={14} className="text-primary" />Active Battles
          </h2>
          {battles.length === 0 ? (
            <p className="text-xs text-muted-foreground">No live battles right now.</p>
          ) : (
            <ul className="space-y-2">
              {battles.map((b) => (
                <li key={b.id}>
                  <Link to={`/battles/${b.id}`} className="block text-xs hover:text-primary">
                    Battle #{b.id.slice(0, 6)} · {b.category?.replace(/_/g, " ")}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to={`/battles?main=${main.slug}${sub ? `&sub=${sub.slug}` : ""}`}
            className="text-[11px] text-primary mt-2 inline-block">All battles →</Link>
        </div>

        <div className="royal-card p-4">
          <h2 className="font-display text-base mb-3 flex items-center gap-2">
            <Trophy size={14} className="text-primary" />Recent Winners
          </h2>
          {crowns.length === 0 ? (
            <p className="text-xs text-muted-foreground">No crowns awarded here yet.</p>
          ) : (
            <ul className="space-y-2">
              {crowns.slice(0, 5).map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <div className="size-7 rounded-full bg-muted overflow-hidden">
                    {c.user?.profile_photo_url && (
                      <img src={c.user.profile_photo_url} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <Link to={`/profile/${c.user?.username}`} className="text-xs font-bold hover:text-primary truncate flex-1">
                    @{c.user?.username ?? "unknown"}
                  </Link>
                  <span className="text-[10px] text-muted-foreground truncate">{c.category.replace(/_/g, " ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Trending posts grid */}
      <section>
        <h2 className="font-display text-lg mb-3 flex items-center gap-2">
          <TrendingUp size={16} className="text-primary" /> Trending Posts
        </h2>
        {loading && <p className="text-xs text-muted-foreground">Loading rankings…</p>}
        {!loading && visiblePosts.length === 0 && (
          <div className="royal-card p-8 text-center">
            <Crown size={28} className="mx-auto text-muted-foreground mb-2" />
            <p className="font-semibold mb-1">The throne is vacant.</p>
            <p className="text-xs text-muted-foreground mb-4">Be the first to compete in this category.</p>
            <Link to={`/upload?main=${main.slug}${sub ? `&sub=${sub.slug}` : ""}`}
              className="inline-block px-4 py-2 rounded-full text-xs font-bold bg-gradient-gold text-primary-foreground">
              Claim the crown
            </Link>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {rest.map((p, i) => (
            <PostPreviewTile
              key={p.id}
              post={p}
              badge={
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold backdrop-blur z-10">
                  #{i + 4}
                </div>
              }
            />
          ))}
        </div>
        {rest.length > 0 && (
          <p className="text-[10px] text-muted-foreground mt-3 flex items-center gap-2">
            <Flame size={10} /> Ranked by crown score
          </p>
        )}
      </section>
    </main>
  );
}
