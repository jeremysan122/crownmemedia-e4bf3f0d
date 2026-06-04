// Category Hub — /c/:mainSlug and /c/:mainSlug/:subSlug
//
// Shows the full competitive surface for a category: top crown holder,
// trending posts, leaderboard, subcategory navigator.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Crown, Flame, TrendingUp, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
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
  caption: string | null;
  crown_score: number;
  vote_count: number;
  profile: { username: string; profile_photo_url: string | null } | null;
}

export default function CategoryHub() {
  const { mainSlug, subSlug } = useParams();
  const { user } = useAuth();
  const [mains, setMains] = useState<MainCategory[]>([]);
  const [subs, setSubs] = useState<Subcategory[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
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

  // Load posts for this category
  useEffect(() => {
    if (!mainSlug) return;
    setLoading(true);
    (async () => {
      let q = supabase
        .from("posts")
        .select("id, user_id, image_url, caption, crown_score, vote_count, profile:profiles!posts_user_id_fkey(username, profile_photo_url)")
        .eq("is_removed", false)
        .order("crown_score", { ascending: false })
        .limit(50);
      if (sub) q = q.eq("subcategory_slug", sub.slug);
      else q = q.eq("main_category_slug", mainSlug);
      const { data } = await q;
      setPosts((data as any) || []);
      setLoading(false);
    })();
  }, [mainSlug, sub?.slug]);

  // Follow state
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

  if (!main && mains.length > 0) {
    return (
      <main className="max-w-3xl mx-auto p-6 text-center">
        <h1 className="font-display text-2xl mb-2">Category not found</h1>
        <Link to="/discover" className="text-primary text-sm hover:underline">Browse all categories</Link>
      </main>
    );
  }
  if (!main) return <div className="p-6 text-muted-foreground text-sm">Loading…</div>;

  const onFollow = async () => {
    if (!user) return;
    setFollowing((f) => !f);
    await toggleCategoryFollow({
      userId: user.id,
      mainCategoryId: sub ? null : main.id,
      subcategoryId: sub ? sub.id : null,
      state: "following",
    });
  };

  return (
    <main className="max-w-5xl mx-auto px-4 pb-24">
      {/* Hero */}
      <header className={`relative rounded-3xl overflow-hidden p-8 mt-4 mb-6 bg-gradient-to-br ${main.gradient ?? "from-amber-400 to-yellow-600"} text-white shadow-xl`}>
        <div className="absolute inset-0 bg-black/20" />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.3em] opacity-80 mb-1">Royal Hub</p>
          <h1 className="font-display text-4xl md:text-5xl mb-2">{main.label}</h1>
          {sub && <p className="text-xl font-semibold opacity-90 mb-2">→ {sub.label}</p>}
          {main.description && !sub && <p className="text-sm opacity-90 max-w-xl">{main.description}</p>}
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={onFollow}
              disabled={!user}
              className={`px-4 py-2 rounded-full text-xs font-bold backdrop-blur transition ${
                following ? "bg-white/20 text-white" : "bg-white text-foreground hover:bg-white/90"
              }`}
            >
              {following ? "Following" : "Follow Category"}
            </button>
            <Link to={`/leaderboard?main=${main.slug}${sub ? `&sub=${sub.slug}` : ""}`}
              className="px-4 py-2 rounded-full text-xs font-bold bg-black/30 text-white hover:bg-black/40">
              <Crown size={12} className="inline mr-1.5" />Leaderboard
            </Link>
            <Link to={`/upload?main=${main.slug}${sub ? `&sub=${sub.slug}` : ""}`}
              className="px-4 py-2 rounded-full text-xs font-bold bg-black/30 text-white hover:bg-black/40">
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

      {/* Rankings */}
      <section>
        <h2 className="font-display text-lg mb-3 flex items-center gap-2">
          <TrendingUp size={16} className="text-primary" /> Top contenders
        </h2>
        {loading && <p className="text-xs text-muted-foreground">Loading rankings…</p>}
        {!loading && posts.length === 0 && (
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
          {posts.map((p, i) => (
            <Link key={p.id} to={`/post/${p.id}`} className="royal-card overflow-hidden hover:border-primary/40 transition group">
              <div className="relative aspect-square bg-muted overflow-hidden">
                {p.image_url && (
                  <img loading="lazy" src={p.image_url} alt={p.caption ?? ""} className="w-full h-full object-cover group-hover:scale-105 transition" />
                )}
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold backdrop-blur">
                  #{i + 1}
                </div>
                <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 text-gold text-[10px] font-bold backdrop-blur">
                  <Crown size={10} fill="currentColor" />{p.crown_score}
                </div>
              </div>
              <div className="p-2">
                <p className="text-xs font-semibold truncate">@{p.profile?.username ?? "unknown"}</p>
                <p className="text-[10px] text-muted-foreground flex items-center gap-2">
                  <Flame size={10} />{p.vote_count} votes
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
