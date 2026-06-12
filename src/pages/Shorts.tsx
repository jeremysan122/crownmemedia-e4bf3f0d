import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import CrownLoader from "@/components/CrownLoader";
import RetryState from "@/components/states/RetryState";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { ArrowLeft, MessageCircle, Share2, Volume2, VolumeX, Heart } from "lucide-react";
import { CrownIcon } from "@/components/CrownIcon";
import { toast } from "sonner";
import { fetchShortsPage } from "@/lib/postQuery";
import type { FeedPost } from "@/components/PostCard";
import { trackUsage } from "@/lib/usageTrack";
import CommentsDrawer from "@/components/CommentsDrawer";
import { useFeedFilters } from "@/hooks/useFeedFilters";
import { EyeOff, Eye } from "lucide-react";
import { rememberPostAsGiftTarget } from "@/lib/recentGiftTargets";


// Shorts uses the canonical post row shape (see src/lib/postQuery.ts) so the
// same post displays identically in the feed, profile, and post detail.
type Short = FeedPost & {
  video_url: string;
  duration_ms?: number | null;
};

const PAGE_SIZE = 12;

export default function Shorts() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { sensitiveMode } = useFeedFilters();
  useSeoMeta({
    title: "Scrolls — CrownMe",
    description: "Scroll through quick royal videos from the CrownMe community.",
  });

  const [items, setItems] = useState<Short[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [endReached, setEndReached] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  // Desktop ≥1024px → right-side comments panel; below → bottom slide-up sheet.
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const loadingMoreRef = useRef(false);


  // Helper: is this scroll currently hidden behind a content warning?
  // Authors always see their own. Hide mode filters at load time.
  const isBlurred = useCallback((p: Short) => {
    if (!p.is_sensitive) return false;
    if (user?.id && p.user_id === user.id) return false;
    if (sensitiveMode === "show") return false;
    return !revealed.has(p.id);
  }, [revealed, sensitiveMode, user?.id]);

  const loadPage = useCallback(async (cursor?: string) => {
    const rows = await fetchShortsPage({ limit: PAGE_SIZE, beforeCreatedAt: cursor });
    return rows.filter((r) => {
      if (!r.video_url) return false;
      // Viewer chose to hide sensitive content — drop it from the queue entirely
      // (except for the author's own scrolls).
      if (sensitiveMode === "hide" && r.is_sensitive && r.user_id !== user?.id) return false;
      return true;
    }) as Short[];
  }, [sensitiveMode, user?.id]);


  const loadInitial = useCallback(async () => {
    setLoadError(null);
    try {
      const first = await loadPage();
      setItems(first);
      setEndReached(first.length < PAGE_SIZE);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load scrolls");
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  }, [loadPage]);

  useEffect(() => {
    setLoading(true);
    void loadInitial();
  }, [loadInitial]);

  // Preserve scroll position when returning from a post detail / comments.
  useScrollRestoration("shorts:feed", containerRef, { ready: !loading && items.length > 0 });

  useEffect(() => { trackUsage("scrolls_opened"); }, []);

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
            rememberPostAsGiftTarget(items[idx], "viewed");
            vid.muted = muted;
            // Never autoplay sensitive content that hasn't been revealed yet.
            if (!isBlurred(items[idx])) {
              vid.play().catch(() => { /* Autoplay blocked by browser policy */ });
            } else {
              vid.pause();
            }
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
  }, [items, muted, loadMore, isBlurred]);

  useEffect(() => {
    videoRefs.current.forEach((v) => { if (v) v.muted = muted; });
  }, [muted]);

  // Pause the active video while the comments overlay is open; resume on close.
  useEffect(() => {
    const vid = videoRefs.current[activeIdx];
    if (!vid) return;
    if (commentsPostId) {
      vid.pause();
    } else {
      vid.play().catch(() => { /* autoplay may be blocked */ });
    }
  }, [commentsPostId, activeIdx]);

  // Keep comment counts in sync when a comment is added anywhere in the app.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ postId: string }>).detail;
      if (!detail?.postId) return;
      setItems((prev) => prev.map((p) => p.id === detail.postId ? { ...p, comment_count: p.comment_count + 1 } : p));
    };
    window.addEventListener("crownme:comment-added", handler as EventListener);
    return () => window.removeEventListener("crownme:comment-added", handler as EventListener);
  }, []);


  async function castCrown(post: Short) {
    if (!user) { nav("/auth?mode=login"); return; }
    rememberPostAsGiftTarget(post, "liked");
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
  if (loadError) {
    return (
      <main className="fixed inset-0 bg-black text-white flex items-center justify-center p-6">
        <RetryState
          title="Couldn't load scrolls"
          message={loadError}
          retrying={retrying}
          onRetry={() => { setRetrying(true); void loadInitial(); }}
        />
      </main>
    );
  }

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
                  if (isBlurred(p)) return;
                  const v = e.currentTarget;
                  if (v.paused) v.play().catch(() => {});
                  else v.pause();
                }}
                className={`h-full w-full object-contain bg-black transition-[filter] ${isBlurred(p) ? "blur-2xl scale-105" : ""}`}
              />

              {isBlurred(p) && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm p-6 text-center">
                  <div className="flex items-center gap-2 text-white">
                    <EyeOff size={18} className="text-gold" />
                    <span className="font-display text-sm uppercase tracking-widest">Content warning</span>
                  </div>
                  <p className="text-xs text-white/70 max-w-[260px]">
                    {p.sensitive_reason?.trim()
                      ? p.sensitive_reason
                      : "The author marked this scroll as sensitive."}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRevealed((s) => { const n = new Set(s); n.add(p.id); return n; });
                      // Resume playback once revealed if this is the active slide.
                      const vid = videoRefs.current[idx];
                      if (vid && idx === activeIdx) vid.play().catch(() => {});
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-gold/90 hover:bg-gold text-background px-3 py-1.5 text-xs font-semibold active:scale-95 transition"
                  >
                    <Eye size={14} /> View post
                  </button>
                </div>
              )}

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
                <button
                  type="button"
                  onClick={() => setCommentsPostId(p.id)}
                  aria-label="Comments"
                  className="flex flex-col items-center gap-1 active:scale-95 transition"
                >
                  <span className="size-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
                    <MessageCircle className="size-6" />
                  </span>
                  <span className="text-xs font-semibold tabular-nums">{p.comment_count}</span>
                </button>

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
                  {p.profile?.profile_photo_url ? (
                    <img src={p.profile.profile_photo_url} alt="" className="size-9 rounded-full object-cover border border-white/30" />
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

      {/* Comments overlay — Scrolls users never leave the feed to read/post comments. */}
      <CommentsDrawer
        postId={commentsPostId}
        onClose={() => setCommentsPostId(null)}
        variant={isDesktop ? "side" : "sheet"}
      />

    </main>
  );
}

