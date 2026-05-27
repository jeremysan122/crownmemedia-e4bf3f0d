import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import CrownLoader from "@/components/CrownLoader";
import { ArrowLeft, MessageCircle, Share2, Volume2, VolumeX, Heart } from "lucide-react";
import { CrownIcon } from "@/components/CrownIcon";
import { toast } from "sonner";

type Short = {
  id: string;
  user_id: string;
  caption: string | null;
  video_url: string;
  video_poster_url: string | null;
  duration_ms: number | null;
  vote_count: number;
  comment_count: number;
  created_at: string;
  profile: { username: string | null; avatar_url: string | null } | null;
};

const PAGE_SIZE = 12;

export default function Shorts() {
  const nav = useNavigate();
  const { user } = useAuth();
  useSeoMeta({
    title: "Scrolls — CrownMe",
    description: "Scroll through quick royal videos from the CrownMe community.",
  });

  const [items, setItems] = useState<Short[]>([]);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(true);
  const [endReached, setEndReached] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const loadingMoreRef = useRef(false);

  const loadPage = useCallback(async (cursor?: string) => {
    let q = supabase
      .from("posts")
      .select("id,user_id,caption,video_url,video_poster_url,duration_ms,vote_count,comment_count,created_at")
      .eq("media_type", "video")
      .eq("is_removed", false)
      .eq("is_archived", false)
      .not("video_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (cursor) q = q.lt("created_at", cursor);
    const { data, error } = await q;
    if (error) {
      toast.error("Couldn't load scrolls");
      return [] as Short[];
    }
    const rows = (data ?? []) as Omit<Short, "profile">[];
    if (rows.length === 0) return [];
    const ids = Array.from(new Set(rows.map((r) => r.user_id)));
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,username,avatar_url")
      .in("id", ids);
    type ProfRow = { id: string; username: string | null; avatar_url: string | null };
    const map = new Map<string, ProfRow>(((profs ?? []) as unknown as ProfRow[]).map((p) => [p.id, p]));
    return rows.map((r) => {
      const prof = map.get(r.user_id);
      return {
        ...r,
        profile: prof ? { username: prof.username, avatar_url: prof.avatar_url } : null,
      };
    });
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const first = await loadPage();
      setItems(first);
      setEndReached(first.length < PAGE_SIZE);
      setLoading(false);
    })();
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || endReached || items.length === 0) return;
    loadingMoreRef.current = true;
    const last = items[items.length - 1];
    const more = await loadPage(last.created_at);
    if (more.length === 0) setEndReached(true);
    else {
      setItems((prev) => [...prev, ...more]);
      if (more.length < PAGE_SIZE) setEndReached(true);
    }
    loadingMoreRef.current = false;
  }, [items, endReached, loadPage]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const idxAttr = (e.target as HTMLElement).dataset.idx;
          if (!idxAttr) return;
          const idx = Number(idxAttr);
          const vid = videoRefs.current[idx];
          if (!vid) return;
          if (e.isIntersecting && e.intersectionRatio > 0.65) {
            setActiveIdx(idx);
            vid.muted = muted;
            vid.play().catch(() => { /* Autoplay blocked by browser policy */ });
            if (idx >= items.length - 3) loadMore();
          } else {
            vid.pause();
          }
        });
      },
      { root, threshold: [0, 0.65, 1] },
    );
    const slides = root.querySelectorAll<HTMLElement>("[data-short-slide]");
    slides.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [items, muted, loadMore]);

  useEffect(() => {
    videoRefs.current.forEach((v) => { if (v) v.muted = muted; });
  }, [muted]);

  async function castCrown(post: Short) {
    if (!user) { nav("/auth?mode=login"); return; }
    setItems((prev) => prev.map((p) => p.id === post.id ? { ...p, vote_count: p.vote_count + 1 } : p));
    const { error } = await supabase.from("votes").insert({
      post_id: post.id,
      user_id: user.id,
      vote_type: "crown",
    });
    if (error) {
      setItems((prev) => prev.map((p) => p.id === post.id ? { ...p, vote_count: Math.max(0, p.vote_count - 1) } : p));
      if (!/duplicate/i.test(error.message)) toast.error("Couldn't crown this scroll");
    }
  }

  async function share(post: Short) {
    const url = `${window.location.origin}/post/${post.id}`;
    if (navigator.share) {
      try { await navigator.share({ url, title: "CrownMe Scroll" }); return; } catch { /* user cancelled */ }
    }
    try { await navigator.clipboard.writeText(url); toast.success("Link copied"); } catch { toast.error("Couldn't copy"); }
  }

  if (loading) return <CrownLoader label="Loading scrolls…" />;

  return (
    <main className="fixed inset-0 bg-black text-white">
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent">
        <button onClick={() => nav(-1)} aria-label="Back" className="p-2 -ml-2 rounded-full hover:bg-white/10">
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="font-display text-lg tracking-widest">SCROLLS</h1>
        <button onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"} className="p-2 -mr-2 rounded-full hover:bg-white/10">
          {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center px-6">
          <Heart className="size-12 text-primary mb-3" aria-hidden />
          <p className="text-lg font-semibold mb-1">No scrolls yet</p>
          <p className="text-sm text-white/60 mb-6">Be the first to post a 30-second clip.</p>
          <Link to="/upload" className="px-5 h-11 inline-flex items-center rounded-full bg-gradient-gold text-primary-foreground font-bold">
            Upload a scroll
          </Link>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="h-full overflow-y-scroll snap-y snap-mandatory scroll-smooth"
        >
          {items.map((p, idx) => (
            <section
              key={p.id}
              data-short-slide
              data-idx={idx}
              className="relative h-[100dvh] w-full snap-start flex items-center justify-center"
            >
              <video
                ref={(el) => { videoRefs.current[idx] = el; }}
                src={p.video_url}
                poster={p.video_poster_url ?? undefined}
                playsInline
                loop
                muted={muted}
                preload={Math.abs(idx - activeIdx) <= 1 ? "auto" : "metadata"}
                onClick={(e) => {
                  const v = e.currentTarget;
                  if (v.paused) v.play().catch(() => {});
                  else v.pause();
                }}
                className="h-full w-full object-contain bg-black"
              />

              <div className="absolute right-3 bottom-28 flex flex-col items-center gap-5">
                <button
                  onClick={() => castCrown(p)}
                  aria-label="Crown this scroll"
                  className="flex flex-col items-center gap-1 group active:scale-95 transition"
                >
                  <span className="size-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center group-hover:bg-primary/30">
                    <CrownIcon className="size-6 text-primary" />
                  </span>
                  <span className="text-xs font-semibold tabular-nums">{p.vote_count}</span>
                </button>
                <Link
                  to={`/post/${p.id}#comments`}
                  aria-label="Comments"
                  className="flex flex-col items-center gap-1"
                >
                  <span className="size-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
                    <MessageCircle className="size-6" />
                  </span>
                  <span className="text-xs font-semibold tabular-nums">{p.comment_count}</span>
                </Link>
                <button
                  onClick={() => share(p)}
                  aria-label="Share"
                  className="flex flex-col items-center gap-1"
                >
                  <span className="size-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
                    <Share2 className="size-6" />
                  </span>
                  <span className="text-xs font-semibold">Share</span>
                </button>
              </div>

              <div className="absolute left-0 right-20 bottom-6 px-4">
                <Link to={`/u/${p.profile?.username ?? p.user_id}`} className="flex items-center gap-2 mb-2">
                  {p.profile?.avatar_url ? (
                    <img src={p.profile.avatar_url} alt="" className="size-9 rounded-full object-cover border border-white/30" />
                  ) : (
                    <span className="size-9 rounded-full bg-white/20" aria-hidden />
                  )}
                  <span className="font-semibold text-sm">@{p.profile?.username ?? "user"}</span>
                </Link>
                {p.caption ? (
                  <p className="text-sm leading-snug line-clamp-3 drop-shadow">{p.caption}</p>
                ) : null}
              </div>
            </section>
          ))}
          {endReached && (
            <div className="h-24 flex items-center justify-center text-xs text-white/40">
              You're all caught up.
            </div>
          )}
        </div>
      )}
    </main>
  );
}
