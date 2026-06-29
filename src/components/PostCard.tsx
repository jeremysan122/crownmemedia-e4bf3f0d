import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Crown, Flame, Gem, Gift, MessageCircle, Share2, MapPin, MoreHorizontal, Pencil, Flag, Ban, Sparkles, Trash2, Archive, Bookmark, Pin, PinOff, Zap, BarChart3, Repeat2, Clock, Eye, EyeOff, } from "lucide-react";
import { BrokenCrown } from "@/components/icons/BrokenCrown";
import { canSeeLikes, canSeeComments } from "@/lib/privacyVisibility";
import HiddenCountLock from "./HiddenCountLock";
import { CATEGORY_LABEL, CrownCategory, formatScore, locationLabel, timeAgo } from "@/lib/crown";
import { CategoryBadge } from "@/lib/categoryIcons";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toggleVote, VoteType } from "@/lib/votes";
import { ShareDialog } from "./ShareDialog";
import GiftPanel from "./gifts/GiftPanel";
import GiftAnimationOverlay from "./gifts/GiftAnimationOverlay";
import type { RoyalGift } from "@/types/gifts";
import { findGift } from "@/lib/gifts";
import { fxGiftSend } from "@/lib/giftFx";
import PostDetailDialog from "./PostDetailDialog";
import CrownScoreBreakdown from "./CrownScoreBreakdown";
import VoteBurst from "./VoteBurst";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import RaceProgressBar, { type RegionScope } from "./RaceProgressBar";
import RaceScopeSelector from "./RaceScopeSelector";
import RoyalPassBadge from "./store/RoyalPassBadge";
import { useIsRoyalPassUser } from "@/hooks/useIsRoyalPassUser";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import EditPostDialog from "./EditPostDialog";
import PostInsightsDialog from "./PostInsightsDialog";
import RepostDialog from "./RepostDialog";
import TaggedPeopleLine from "./TaggedPeopleLine";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";

import { FilterId, isValidFilter, FILTER_BY_ID } from "@/lib/filters";
import PostMedia from "./PostMedia";
import { postMediaFrameClass } from "@/lib/postMediaFrame";
import FilterStreakBadge from "./FilterStreakBadge";
import { useFilterStreaks } from "@/hooks/useFilterStreak";
import { rankBadgeLabel } from "@/lib/rankTitle";
import ReportDialog from "./ReportDialog";
import CommentsDrawer from "./CommentsDrawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIsBelowDesktop } from "@/hooks/use-below-desktop";
import VerifiedBadge from "@/components/VerifiedBadge";
import { rememberPostAsGiftTarget } from "@/lib/recentGiftTargets";

export interface FeedPost {
  id: string;
  user_id: string;
  image_url: string;
  image_urls?: string[] | null;
  caption: string;
  category: CrownCategory;
  city: string | null;
  state: string | null;
  country: string | null;
  crown_score: number;
  vote_count: number;
  comment_count: number;
  share_count: number;
  battle_wins?: number;
  created_at: string;
  edited_at?: string | null;
  pinned_at?: string | null;
  scheduled_for?: string | null;
  parent_post_id?: string | null;
  repost_caption?: string | null;
  tagged_user_ids?: string[] | null;
  media_type?: "image" | "video" | null;
  video_url?: string | null;
  video_poster_url?: string | null;
  filter?: string | null;
  alt_texts?: string[] | null;
  profile: {
    username: string;
    profile_photo_url: string | null;
    crowns_held: number;
    gender?: import("@/lib/rankTitle").GenderValue;
    hide_likes?: boolean | null;
    hide_comments?: boolean | null;
    hide_views?: boolean | null;
  };
  parent?: {
    id: string;
    user_id: string;
    image_url?: string | null;
    image_urls?: string[] | null;
    caption?: string | null;
    category?: CrownCategory | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    crown_score?: number | null;
    vote_count?: number | null;
    comment_count?: number | null;
    share_count?: number | null;
    battle_wins?: number | null;
    media_type?: "image" | "video" | null;
    video_url?: string | null;
    video_poster_url?: string | null;
    filter?: string | null;
    alt_texts?: string[] | null;
    tagged_user_ids?: string[] | null;
    is_sensitive?: boolean | null;
    sensitive_reason?: string | null;
    created_at?: string | null;
    profile: {
      username: string;
      profile_photo_url: string | null;
      crowns_held: number;
      gender?: import("@/lib/rankTitle").GenderValue;
      hide_likes?: boolean | null;
      hide_comments?: boolean | null;
      hide_views?: boolean | null;
      verified?: boolean | null;
    };
  } | null;
  rank?: number | null;
  is_sensitive?: boolean | null;
  sensitive_reason?: string | null;
}

// ── Module-level VoteBtn ────────────────────────────────────────────────────
// Defined outside PostCard so React sees the same component type across renders.
// An inline `const VoteBtn = (...)` inside the render body creates a *new* function
// type on every render, causing React to unmount + remount the button DOM tree.
interface VoteBtnProps {
  type: VoteType;
  icon: typeof Crown; // Lucide icon type — same as original inline VoteBtn
  color: string;
  active: boolean;
  burst: VoteType | null;
  showLikes: boolean;
  count: number;
  onVote: (t: VoteType) => void;
}
const VoteBtn = memo(function VoteBtn({ type, icon: Icon, color, active, burst, showLikes, count, onVote }: VoteBtnProps) {
  return (
    <button
      onPointerDown={() => {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          try { navigator.vibrate(active ? 8 : 14); } catch { /* noop */ }
        }
      }}
      onClick={() => onVote(type)}
      aria-pressed={active}
      aria-label={`${type} vote`}
      className={`flex items-center gap-1 px-2 py-1 rounded-full transition-all active:scale-95 ${
        active ? `bg-gradient-to-br ${color} text-white shadow-lg` : "bg-muted/50 text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon size={14} className={burst === type ? "animate-vote-burst" : ""} fill={active ? "currentColor" : "none"} />
      {showLikes ? (
        <span className="text-[11px] font-bold tabular-nums">{count}</span>
      ) : (
        <HiddenCountLock kind="likes" />
      )}
    </button>
  );
});

function PostCard({ post, onCommentClick }: { post: FeedPost; onCommentClick?: (id: string) => void }) {
  const { user, profile: viewerProfile } = useAuth();
  const sensitiveMode = (((viewerProfile as any)?.sensitive_content_mode as "blur" | "show" | "hide") || "blur");
  const isOwnPost = user?.id === post.user_id;
  const shouldBlurSensitive = !!post.is_sensitive && sensitiveMode === "blur" && !isOwnPost;
  const [sensitiveRevealed, setSensitiveRevealed] = useState(false);
  // ── Repost attribution ──
  // For reposts we display the ORIGINAL author and route ALL interactions
  // (votes, comments, gifts, share, bookmark, realtime subscriptions, race
  // progress, gift recipient, reporting) to the parent post — the repost row
  // is just a shell pointing back at the original (Instagram/X model).
  // The parent is hydrated by `hydrateParents()` in src/lib/postQuery.ts.
  const isRepost = !!post.parent_post_id && !!post.parent?.profile;
  const displayProfile = isRepost ? post.parent!.profile : post.profile;
  const displayUserId = isRepost ? post.parent!.user_id : post.user_id;
  const reposterUsername = isRepost ? post.profile.username : null;
  const interactionPostId = isRepost ? post.parent!.id : post.id;
  const isPassMember = useIsRoyalPassUser(displayUserId);
  const [myVotes, setMyVotes] = useState<Set<VoteType>>(new Set());
  // Initial counts seed from the parent when this is a repost so the card
  // never momentarily shows "0 votes" before the realtime refetch lands.
  const seed = isRepost
    ? {
        vote_count: post.parent!.vote_count ?? 0,
        comment_count: post.parent!.comment_count ?? 0,
        share_count: post.parent!.share_count ?? 0,
        crown_score: post.parent!.crown_score ?? 0,
        battle_wins: post.parent!.battle_wins ?? 0,
      }
    : {
        vote_count: post.vote_count,
        comment_count: post.comment_count,
        share_count: post.share_count ?? 0,
        crown_score: post.crown_score,
        battle_wins: post.battle_wins ?? 0,
      };
  const [counts, setCounts] = useState({
    crown: 0, fire: 0, diamond: 0, dislike: 0,
    total: seed.vote_count, score: seed.crown_score, comments: seed.comment_count,
    shares: seed.share_count, battleWins: seed.battle_wins,
  });
  const [burst, setBurst] = useState<VoteType | null>(null);
  // Timer refs — clear on component unmount to prevent setState on unmounted component.
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scoreBumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterBoostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commentBumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [activeGift, setActiveGift] = useState<RoyalGift | null>(null);
  const [activeGiftQty, setActiveGiftQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [repostOpen, setRepostOpen] = useState(false);
  const nav = useNavigate();
  const articleRef = useRef<HTMLElement | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [commentsDrawerOpen, setCommentsDrawerOpen] = useState(false);
  const isMobile = useIsMobile();
  const isBelowDesktop = useIsBelowDesktop();
  const [hidden, setHidden] = useState(false);
  const [liveCaption, setLiveCaption] = useState(post.caption);
  const [liveCover, setLiveCover] = useState(post.image_url);
  const [liveFilter, setLiveFilter] = useState<FilterId | null>(
    isValidFilter(post.filter ?? null) ? (post.filter as FilterId) : null
  );
  const [liveImageUrls, setLiveImageUrls] = useState<string[] | null>(post.image_urls ?? null);
  const [liveAltTexts, setLiveAltTexts] = useState<string[] | null>(post.alt_texts ?? null);
  const [liveCategory, setLiveCategory] = useState<CrownCategory>(post.category);
  const [liveCity, setLiveCity] = useState<string | null>(post.city);
  const [liveState, setLiveState] = useState<string | null>(post.state);
  const [liveCountry, setLiveCountry] = useState<string | null>(post.country);
  const [liveEditedAt, setLiveEditedAt] = useState<string | null>(post.edited_at ?? null);
  const [pinnedAt, setPinnedAt] = useState<string | null>(post.pinned_at ?? null);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [raceScope, setRaceScope] = useState<RegionScope>(
    post.city ? "city" : post.state ? "state" : post.country ? "country" : "global"
  );
  const isOwner = !!user && user.id === post.user_id;

  const reportPost = () => {
    if (!user?.id) return toast.error("Sign in to report");
    setReportOpen(true);
  };
  const blockUser = async () => {
    if (!user) return toast.error("Sign in to block");
    if (isOwner) return;
    // Block the displayed author. For reposts that's the ORIGINAL author so
    // hiding "this content" hides the content's true owner, not just the
    // intermediate reposter.
    const { error } = await supabase.from("blocks").insert({
      blocker_id: user.id, blocked_id: displayUserId,
    });
    if (error) return toast.error(error.message);
    trackEvent("user_blocked", { metadata: { blocked_id: displayUserId } });
    toast.success(`Blocked @${displayProfile.username}`);
    setHidden(true);
  };
  const deletePost = async () => {
    if (!user || !isOwner) return;
    if (!window.confirm("Delete this post permanently? This cannot be undone.")) return;
    const { error } = await supabase.from("posts").delete().eq("id", post.id).eq("user_id", user.id);
    if (error) return toast.error(error.message);
    trackEvent("post_deleted", { metadata: { post_id: interactionPostId } });
    toast.success("Post deleted");
    setHidden(true);
    window.dispatchEvent(new CustomEvent("post:deleted", { detail: { id: post.id } }));
  };

  const archivePost = async () => {
    if (!user || !isOwner) return;
    const { error } = await supabase
      .from("posts")
      .update({ is_archived: true, archived_at: new Date().toISOString() } as any)
      .eq("id", post.id)
      .eq("user_id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Post archived — find it in Settings → Archived");
    setHidden(true);
    window.dispatchEvent(new CustomEvent("post:deleted", { detail: { id: post.id } }));
  };
  const togglePin = async () => {
    if (!user || !isOwner) return;
    const next = pinnedAt ? null : new Date().toISOString();
    setPinnedAt(next);
    const { error } = await supabase
      .from("posts")
      .update({ pinned_at: next } as any)
      .eq("id", post.id)
      .eq("user_id", user.id);
    if (error) {
      setPinnedAt(pinnedAt); // revert
      return toast.error(error.message);
    }
    toast.success(next ? "Pinned to your profile" : "Unpinned");
    window.dispatchEvent(new CustomEvent("post:updated", { detail: { id: post.id, pinned_at: next } }));
  };

  const toggleBookmark = async () => {
    if (!user) return toast.error("Sign in to save posts");
    if (bookmarkBusy) return;
    setBookmarkBusy(true);
    const wasBookmarked = bookmarked;
    setBookmarked(!wasBookmarked); // optimistic
    try {
      if (wasBookmarked) {
        const { error } = await supabase
          .from("post_bookmarks" as any)
          .delete()
          .eq("user_id", user.id)
          .eq("post_id", interactionPostId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("post_bookmarks" as any)
          .insert({ user_id: user.id, post_id: interactionPostId });
        if (error && (error as any).code !== "23505") throw error;
        rememberPostAsGiftTarget(post, "saved");
        toast.success("Saved");
      }
    } catch (e) {
      setBookmarked(wasBookmarked);
      const msg = e instanceof Error ? e.message : "Failed to save";
      toast.error(msg);
    } finally {
      setBookmarkBusy(false);
    }
  };

  // (other tab, other view, edit dialog), patch local state in real time.
  useEffect(() => {
    const onUpdated = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d || d.id !== post.id) return;
      if (typeof d.caption === "string") setLiveCaption(d.caption);
      if (typeof d.image_url === "string") setLiveCover(d.image_url);
      if (d.filter !== undefined) setLiveFilter(isValidFilter(d.filter) ? d.filter : null);
      if (Array.isArray(d.image_urls)) setLiveImageUrls(d.image_urls);
      if (Array.isArray(d.alt_texts)) setLiveAltTexts(d.alt_texts);
      if (typeof d.category === "string") setLiveCategory(d.category);
      if ("city" in d) setLiveCity(d.city);
      if ("state" in d) setLiveState(d.state);
      if ("country" in d) setLiveCountry(d.country);
      if ("pinned_at" in d) setPinnedAt(d.pinned_at);
      if ("edited_at" in d) setLiveEditedAt(d.edited_at ?? new Date().toISOString());
      // Optimistic edited mark — the trigger will stamp the real value
      if (
        typeof d.caption === "string" || typeof d.image_url === "string" ||
        Array.isArray(d.image_urls) || Array.isArray(d.alt_texts) ||
        d.filter !== undefined || typeof d.category === "string" ||
        "city" in d || "state" in d || "country" in d
      ) {
        setLiveEditedAt(new Date().toISOString());
      }
    };
    const onDeleted = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.id === post.id) setHidden(true);
    };
    window.addEventListener("post:updated", onUpdated);
    window.addEventListener("post:deleted", onDeleted);
    return () => {
      window.removeEventListener("post:updated", onUpdated);
      window.removeEventListener("post:deleted", onDeleted);
    };
  }, [post.id]);

  // Hydrate bookmark state on mount
  useEffect(() => {
    if (!user) { setBookmarked(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("post_bookmarks" as any)
        .select("id")
        .eq("user_id", user.id)
        .eq("post_id", interactionPostId)
        .maybeSingle();
      if (!cancelled) setBookmarked(!!data);
    })();
    return () => { cancelled = true; };
  }, [post.id, user?.id]);

  const sourceUrls = liveImageUrls && liveImageUrls.length > 0 ? liveImageUrls : null;
  const images = sourceUrls
    ? [liveCover, ...sourceUrls.slice(1)]
    : [liveCover];
  const isMulti = images.length > 1;

  const onScrollImages = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== activeImage) setActiveImage(idx);
  };

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.rpc("get_post_vote_stats", { _post_id: interactionPostId });
      const stats = (data ?? {}) as { counts?: Record<string, number>; my_votes?: string[] };
      const counts = stats.counts ?? {};
      const byType = {
        crown: counts.crown ?? 0,
        fire: counts.fire ?? 0,
        diamond: counts.diamond ?? 0,
        dislike: counts.dislike ?? 0,
      };
      const mine = new Set<VoteType>((stats.my_votes ?? []) as VoteType[]);
      setMyVotes(mine);
      setCounts((c) => ({ ...c, ...byType, total: byType.crown + byType.fire + byType.diamond }));
    };
    load();
  // user?.id — the stable primitive, not the full User object, prevents
  // redundant refetches when other user properties update.
  }, [post.id, user?.id]);


  // Realtime status — for graceful loading/error UI when the channel drops
  const [rtStatus, setRtStatus] = useState<"connecting" | "live" | "reconnecting" | "error">("connecting");

  // realtime votes + comments — unique channel per mount, with single-flight
  // resubscribe so concurrent error/timeout events can never schedule
  // overlapping reconnect timers (which would create duplicate channels and
  // duplicate state updates after recovery).
  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnecting = false;       // single-flight guard
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;

    const refetchAll = async () => {
      const [{ data: stats }, { data: postRow }, { count: cmtCount }] = await Promise.all([
        supabase.rpc("get_post_vote_stats", { _post_id: interactionPostId }),
        supabase.from("posts").select("crown_score, comment_count, share_count, battle_wins").eq("id", interactionPostId).maybeSingle(),
        supabase.from("comments").select("id", { count: "exact", head: true }).eq("post_id", interactionPostId).eq("is_removed", false),
      ]);
      if (cancelled) return;
      const c2 = ((stats ?? {}) as { counts?: Record<string, number> }).counts ?? {};
      const byType = { crown: c2.crown ?? 0, fire: c2.fire ?? 0, diamond: c2.diamond ?? 0, dislike: c2.dislike ?? 0 };
      setCounts((c) => ({
        ...c,
        ...byType,
        total: byType.crown + byType.fire + byType.diamond,
        score: postRow?.crown_score ?? c.score,
        comments: typeof cmtCount === "number" ? cmtCount : (postRow?.comment_count ?? c.comments),
        shares: postRow?.share_count ?? c.shares,
        battleWins: postRow?.battle_wins ?? c.battleWins,
      }));
    };


    const teardown = () => {
      if (activeChannel) {
        try { supabase.removeChannel(activeChannel); } catch { /* noop */ }
        activeChannel = null;
      }
    };

    const scheduleReconnect = () => {
      // Single-flight: never queue another reconnect while one is pending or
      // a fresh subscribe is in flight.
      if (reconnecting || cancelled) return;
      reconnecting = true;
      const delay = Math.min(8000, 500 * Math.pow(2, attempt++));
      if (attempt > 4) setRtStatus("error");
      else setRtStatus("reconnecting");
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (cancelled) return;
        teardown();
        reconnecting = false;
        subscribe();
      }, delay);
    };

    const subscribe = () => {
      if (cancelled || activeChannel) return; // never overlap channels
      const channelName = `post-${interactionPostId}-${crypto.randomUUID()}`;
      const ch = supabase.channel(channelName);
      activeChannel = ch;
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes", filter: `post_id=eq.${interactionPostId}` },
        async () => {
          const { data: stats } = await supabase.rpc("get_post_vote_stats", { _post_id: interactionPostId });
          if (cancelled) return;
          const c2 = ((stats ?? {}) as { counts?: Record<string, number> }).counts ?? {};
          const byType = { crown: c2.crown ?? 0, fire: c2.fire ?? 0, diamond: c2.diamond ?? 0, dislike: c2.dislike ?? 0 };
          setCounts((c) => ({ ...c, ...byType, total: byType.crown + byType.fire + byType.diamond }));
        },
      ).on(

        "postgres_changes",
        { event: "*", schema: "public", table: "posts", filter: `id=eq.${interactionPostId}` },
        (payload) => {
          const row: any = payload.new;
          if (!row || cancelled) return;
          setCounts((c) => ({
            ...c,
            score: row.crown_score ?? c.score,
            comments: row.comment_count ?? c.comments,
            shares: row.share_count ?? c.shares,
            battleWins: row.battle_wins ?? c.battleWins,
          }));
          if (typeof row.caption === "string") setLiveCaption(row.caption);
          if (typeof row.image_url === "string") setLiveCover(row.image_url);
          if (isValidFilter(row.filter ?? null)) setLiveFilter(row.filter as FilterId);
          else if (row.filter === null) setLiveFilter(null);
        },
      ).on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `post_id=eq.${interactionPostId}` },
        async () => {
          const { count } = await supabase
            .from("comments")
            .select("id", { count: "exact", head: true })
            .eq("post_id", interactionPostId)
            .eq("is_removed", false);
          if (typeof count === "number" && !cancelled) setCounts((c) => ({ ...c, comments: count }));
        },
      ).subscribe((status) => {
        // Note: gift_transactions is no longer in the realtime publication for security
        // (financial data isolation). Sender-side gift animations still fire locally.
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          setRtStatus("live");
          attempt = 0;
          reconnecting = false;
          // Resync from source of truth — replaces (does not duplicate) state.
          refetchAll();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          scheduleReconnect();
        }
      });
    };

    subscribe();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      teardown();
    };
  // user?.id — stable primitive dep avoids spurious channel teardown/rebuild
  // whenever unrelated User object properties refresh.
  }, [post.id, user?.id]);

  const VOTE_WEIGHT: Record<VoteType, number> = { crown: 1, fire: 0.5, diamond: 1.5, dislike: 0 };
  const [scoreBump, setScoreBump] = useState(false);
  const [overlayBurst, setOverlayBurst] = useState<{ type: VoteType; delta: string } | null>(null);
  // Smoothly interpolate the displayed score so optimistic + realtime
  // updates never "snap" — the number visibly counts up.
  const animatedScore = useAnimatedNumber(counts.score, 550);

  // Optimistic +1% Crown Score bump when the user posts a comment, so the
  // bonus feels instant. The DB trigger recalculates authoritative score and
  // the realtime channel reconciles within ~1s.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ postId: string }>).detail;
      if (!detail || detail.postId !== interactionPostId) return;
      setCounts((c) => ({
        ...c,
        comments: c.comments + 1,
        score: c.score + Math.max(0.1, c.score * 0.01),
      }));
      setScoreBump(true);
      if (commentBumpTimerRef.current) clearTimeout(commentBumpTimerRef.current);
      commentBumpTimerRef.current = setTimeout(() => setScoreBump(false), 700);
    };
    window.addEventListener("crownme:comment-added", handler as EventListener);
    return () => window.removeEventListener("crownme:comment-added", handler as EventListener);
  }, [post.id]);

  const [filterBoost, setFilterBoost] = useState<VoteType | null>(null);
  const { bump: bumpFilterStreak } = useFilterStreaks();

  // Cleanup all pending timers when the card unmounts so we never call setState
  // on an unmounted component (e.g. user navigates away mid-animation).
  useEffect(() => () => {
    if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    if (scoreBumpTimerRef.current) clearTimeout(scoreBumpTimerRef.current);
    if (filterBoostTimerRef.current) clearTimeout(filterBoostTimerRef.current);
    if (commentBumpTimerRef.current) clearTimeout(commentBumpTimerRef.current);
  }, []);

  useEffect(() => {
    const node = articleRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    let marked = false;
    const io = new IntersectionObserver(([entry]) => {
      if (marked || !entry.isIntersecting || entry.intersectionRatio < 0.55) return;
      marked = true;
      rememberPostAsGiftTarget(post, "viewed");
      io.disconnect();
    }, { threshold: [0.55] });
    io.observe(node);
    return () => io.disconnect();
  }, [post.id]);

  const onVote = useCallback(async (t: VoteType) => {
    if (!user) return;
    const had = myVotes.has(t);
    // Mutual exclusivity: if a different reaction is currently active, it will
    // be swapped out by toggleVote on the server. Reflect that optimistically.
    const previous: VoteType | null = !had
      ? ((["crown", "fire", "diamond", "dislike"] as VoteType[]).find((x) => myVotes.has(x)) ?? null)
      : null;
    setBurst(t);
    if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    burstTimerRef.current = setTimeout(() => setBurst(null), 500);
    if (!had) {
      if (t !== "dislike") rememberPostAsGiftTarget(post, "liked");
      // Sound + haptics now play centrally inside toggleVote() so every
      // dislike entry point (Feed, Profile, Scrolls, PostDetail, PostPage,
      // dialogs) shares one throttled implementation. We intentionally do not
      // play it here to avoid double-triggering.
      setOverlayBurst({
        type: t,
        delta: t === "dislike" ? "" : `+${VOTE_WEIGHT[t]}`,
      });
      setScoreBump(true);
      if (scoreBumpTimerRef.current) clearTimeout(scoreBumpTimerRef.current);
      scoreBumpTimerRef.current = setTimeout(() => setScoreBump(false), 700);
      if (liveFilter && liveFilter !== "none" && t !== "dislike") {
        setFilterBoost(t);
        if (filterBoostTimerRef.current) clearTimeout(filterBoostTimerRef.current);
        filterBoostTimerRef.current = setTimeout(() => setFilterBoost(null), 650);
        bumpFilterStreak(liveFilter);
      }
    } else {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try { navigator.vibrate(8); } catch { /* noop */ }
      }
    }
    const next = new Set(myVotes);
    if (had) next.delete(t);
    else {
      if (previous) next.delete(previous);
      next.add(t);
    }
    setMyVotes(next);
    // Optimistic count + score updates accounting for any swapped-out reaction.
    const addDelta = had ? -1 : 1;
    const prevWeight = previous ? VOTE_WEIGHT[previous] : 0;
    const scoreDelta = VOTE_WEIGHT[t] * addDelta - prevWeight;
    setCounts((c) => {
      const nextC: any = {
        ...c,
        [t]: c[t] + addDelta,
        score: Math.max(0, c.score + scoreDelta),
      };
      if (previous) nextC[previous] = Math.max(0, c[previous] - 1);
      // `total` tracks visible reactions (crown+fire+diamond, see refetchAll).
      const totalDelta =
        (t === "dislike" ? 0 : addDelta) - (previous && previous !== "dislike" ? 1 : 0);
      nextC.total = Math.max(0, c.total + totalDelta);
      return nextC;
    });
    await toggleVote(interactionPostId, user!.id, t);
  }, [user?.id, myVotes, counts, liveFilter, bumpFilterStreak, post]);

  const showLikes = canSeeLikes(post.profile, { isOwner });
  const showComments = canSeeComments(post.profile, { isOwner });

  if (hidden) return null;
  return (
    <article ref={articleRef} className="royal-card overflow-hidden mb-3 animate-fade-in relative text-[13px]">
      {isRepost && reposterUsername && (
        <Link
          to={`/${reposterUsername}`}
          className="flex items-center gap-1.5 px-3 pt-2 -mb-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Repeat2 size={12} className="text-primary" />
          <span>
            Reposted by <span className="font-semibold text-foreground">@{reposterUsername}</span>
          </span>
        </Link>
      )}
      {/* Header — Instagram-style: larger avatar, bolder username, quieter meta */}
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <Link to={`/${displayProfile.username}`} className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`${displayProfile.crowns_held > 0 ? "crown-ring" : ""} ${isPassMember ? "ring-2 ring-gold/60 rounded-full" : ""} shrink-0`}>
            <div className="size-9 rounded-full bg-muted overflow-hidden ring-1 ring-border">
              {displayProfile.profile_photo_url ? (
                <img loading="lazy" src={displayProfile.profile_photo_url} alt={displayProfile.username} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                  {displayProfile.username[0]?.toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 min-w-0">
              <span className="font-bold text-sm truncate leading-tight">{displayProfile.username}</span>
              {(displayProfile as any).verified && <VerifiedBadge size={13} />}
              {displayProfile.crowns_held > 0 && <Crown size={11} className="text-primary shrink-0" fill="currentColor" />}
              {isPassMember && <RoyalPassBadge />}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground min-w-0 leading-tight">
              <MapPin size={9} className="shrink-0" />
              <span className="truncate">{locationLabel({ city: liveCity, state: liveState, country: liveCountry })}</span>
              {pinnedAt && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[9px] font-bold uppercase tracking-wide shrink-0" title="Pinned to profile">
                  <Pin size={8} fill="currentColor" /> Pinned
                </span>
              )}
              {post.scheduled_for && new Date(post.scheduled_for) > new Date() && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-muted text-foreground text-[9px] font-bold uppercase tracking-wide shrink-0" title={`Scheduled for ${new Date(post.scheduled_for).toLocaleString()}`}>
                  <Clock size={8} /> Scheduled
                </span>
              )}
            </div>
          </div>
        </Link>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {timeAgo(post.created_at)}
            {liveEditedAt && <span className="ml-1 italic text-[10px]">· edited</span>}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Post options"
                className="size-7 rounded-full hover:bg-muted/60 flex items-center justify-center text-muted-foreground"
              >
                <MoreHorizontal size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {isOwner && (
                <>
                  <DropdownMenuItem onClick={() => setEditOpen(true)}>
                    <Pencil size={14} className="mr-2" /> Edit post
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setInsightsOpen(true)}>
                    <BarChart3 size={14} className="mr-2" /> Insights
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => nav("/store?tab=boosts")}>
                    <Zap size={14} className="mr-2" /> Boost this post
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={togglePin}>
                    {pinnedAt
                      ? <><PinOff size={14} className="mr-2" /> Unpin from profile</>
                      : <><Pin size={14} className="mr-2" /> Pin to profile</>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={archivePost}>
                    <Archive size={14} className="mr-2" /> Archive
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={deletePost} className="text-destructive focus:text-destructive">
                    <Trash2 size={14} className="mr-2" /> Delete post
                  </DropdownMenuItem>
                </>
              )}
              {!isOwner && (
                <>
                  <DropdownMenuItem onClick={reportPost}>
                    <Flag size={14} className="mr-2" /> Report
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={blockUser} className="text-destructive focus:text-destructive">
                    <Ban size={14} className="mr-2" /> Block @{displayProfile.username}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Image(s) — canonical media frame: same aspect ratio on every
          viewport and every surface. For reposts we use the ORIGINAL post's
          media metadata so the repost frames identically to the source. */}
      <div
        className={`relative ${postMediaFrameClass(isRepost ? post.parent : post)} overflow-hidden flex items-center justify-center mx-auto w-full max-w-[640px]`}
        onDoubleClick={() => !myVotes.has("crown") && onVote("crown")}
        onPointerUp={(e) => {
          if (e.pointerType !== "touch") return;
          const now = Date.now();
          const w = window as any;
          if (now - (w.__pc_lastTap__?.[post.id] ?? 0) < 300) {
            w.__pc_lastTap__[post.id] = 0;
            if (!myVotes.has("crown")) onVote("crown");
          } else {
            w.__pc_lastTap__ = w.__pc_lastTap__ ?? {};
            w.__pc_lastTap__[post.id] = now;
          }
        }}
      >
        {/* Soft blurred backdrop sampled from the active image */}
        {images[activeImage] && (
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `url(${images[activeImage]})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(32px) saturate(1.2) brightness(0.5)",
              transform: "scale(1.15)",
            }}
          />
        )}
        <div aria-hidden className="absolute inset-0 bg-background/30 pointer-events-none" />
        {post.media_type === "video" && post.video_url ? (
          <PostMedia
            src={post.video_url}
            poster={post.video_poster_url ?? liveCover}
            mediaType="video"
            filter={liveFilter}
            alt={post.caption || "Video post"}
            onClick={() => setDetailOpen(true)}
            boost={!!filterBoost}
            boostType={filterBoost ?? undefined}
            className="w-full h-full object-cover"
          />
        ) : isMulti ? (
          <div
            className="flex h-full w-full overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar"
            onScroll={onScrollImages}
          >
            {images.map((src, i) => (
              <div key={src + i} className="w-full h-full flex-shrink-0 snap-center cursor-zoom-in flex items-center justify-center" onClick={() => setDetailOpen(true)}>
                <PostMedia
                  src={src}
                  alt={post.alt_texts?.[i] || (post.caption ? `${post.caption} (${i + 1}/${images.length})` : `Photo ${i + 1} of ${images.length}`)}
                  filter={liveFilter}
                  boost={!!filterBoost && i === activeImage}
                  boostType={filterBoost ?? undefined}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        ) : (
          <PostMedia
            src={images[0]}
            alt={post.alt_texts?.[0] || post.caption || "Post"}
            filter={liveFilter}
            onClick={() => setDetailOpen(true)}
            boost={!!filterBoost}
            boostType={filterBoost ?? undefined}
            className="w-full h-full object-cover"
          />
        )}
        <div className="absolute top-3 left-3">
          <CrownScoreBreakdown
            score={counts.score}
            crown={counts.crown}
            fire={counts.fire}
            diamond={counts.diamond}
            comments={counts.comments}
            shares={counts.shares}
            battleWins={counts.battleWins}
          >
            <div
              className={`glass px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs hover:ring-1 hover:ring-primary/40 transition relative ${scoreBump ? "ring-2 ring-primary/70 crown-glow" : ""}`}
              style={scoreBump ? { animation: "score-bump 700ms ease-out" } : undefined}
            >
              <Crown
                size={12}
                className={`text-primary ${scoreBump ? "animate-crown-pulse" : ""}`}
                fill="currentColor"
              />
              <span className="font-bold tabular-nums">{formatScore(animatedScore)}</span>
              <span className="text-muted-foreground">Crown Score</span>
              <span
                aria-label={`Realtime: ${rtStatus}`}
                title={
                  rtStatus === "live" ? "Live updates active"
                  : rtStatus === "reconnecting" ? "Reconnecting…"
                  : rtStatus === "error" ? "Live updates unavailable — pull to refresh"
                  : "Connecting…"
                }
                className={`ml-0.5 size-1.5 rounded-full ${
                  rtStatus === "live" ? "bg-emerald-400 animate-pulse"
                  : rtStatus === "reconnecting" ? "bg-yellow-400 animate-pulse"
                  : rtStatus === "error" ? "bg-destructive"
                  : "bg-muted-foreground/60 animate-pulse"
                }`}
              />
            </div>
          </CrownScoreBreakdown>
        </div>
        {post.rank != null && (
          <div className="absolute top-3 right-3 glass px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5">
            <Crown size={11} className="text-primary" fill="currentColor" />
            <span>{rankBadgeLabel(post.profile?.gender, post.rank)} · {CATEGORY_LABEL[post.category]}</span>
          </div>
        )}
        {isMulti && (
          <>
            <div className="absolute top-3 right-3 glass px-2 py-1 rounded-full text-[11px] font-bold tabular-nums" style={{ top: post.rank != null ? "3.25rem" : "0.75rem" }}>
              {activeImage + 1}/{images.length}
            </div>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
              {images.map((_, i) => (
                <span
                  key={i}
                  className={`size-1.5 rounded-full transition-all ${i === activeImage ? "bg-primary w-4" : "bg-white/60"}`}
                />
              ))}
            </div>
          </>
        )}
        {liveFilter && liveFilter !== "none" && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 pointer-events-none">
            <FilterStreakBadge filter={liveFilter} variant="chip" />
            <div
              className="glass px-2.5 py-1 rounded-full flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
              role="img"
              aria-label={`Filter applied: ${FILTER_BY_ID[liveFilter]?.label ?? liveFilter}${FILTER_BY_ID[liveFilter]?.animated ? " (animated)" : ""}`}
            >
              <Sparkles size={10} className="text-primary" aria-hidden="true" />
              <span aria-hidden="true">{FILTER_BY_ID[liveFilter]?.label ?? liveFilter}</span>
            </div>
          </div>
        )}
        {shouldBlurSensitive && !sensitiveRevealed && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2.5 bg-background/55 backdrop-blur-2xl p-4 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-1.5 text-foreground">
              <EyeOff size={16} className="text-gold" />
              <span className="font-display text-xs uppercase tracking-widest">Content warning</span>
            </div>
            <p className="text-[11px] text-muted-foreground max-w-[260px]">
              {post.sensitive_reason?.trim()
                ? post.sensitive_reason
                : "The author marked this post as sensitive."}
            </p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSensitiveRevealed(true); }}
              className="inline-flex items-center gap-1.5 rounded-full bg-gold/90 hover:bg-gold text-background px-3 py-1.5 text-[11px] font-semibold active:scale-95 transition"
            >
              <Eye size={12} /> View post
            </button>
          </div>
        )}
        {shouldBlurSensitive && sensitiveRevealed && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setSensitiveRevealed(false); }}
            className="absolute bottom-3 right-3 z-30 inline-flex items-center gap-1 rounded-full bg-background/70 backdrop-blur px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
            aria-label="Re-blur sensitive content"
          >
            <EyeOff size={11} /> Hide
          </button>
        )}
      </div>

      {/* Repost attribution now appears as the top banner; keep a link to view the original. */}
      {isRepost && (
        <Link
          to={`/post/${post.parent_post_id}`}
          className="mx-3 mt-2 inline-flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground"
        >
          View original post
        </Link>
      )}
      {/* Quote caption (repost) */}
      {post.repost_caption && (
        <p className="px-3 pt-2 text-xs leading-snug">{post.repost_caption}</p>
      )}
      {/* Caption — Instagram-style: bold username prepended inline, 2-line clamp.
           For reposts the original author byline is used because the caption
           displayed below the media is the ORIGINAL author's caption (the
           reposter's quote, if any, is rendered above as `repost_caption`). */}
      {(liveCaption || (isRepost && post.parent?.caption)) && (
        <p className="px-3 pt-2 text-[13px] leading-snug line-clamp-2">
          <Link to={`/${displayProfile.username}`} className="font-bold mr-1.5 hover:underline">
            {displayProfile.username}
          </Link>
          <span>{liveCaption || post.parent?.caption}</span>
        </p>
      )}
      {/* Comments preview line — IG pattern */}
      {showComments && counts.comments > 0 && (
        <button
          type="button"
          onClick={() => {
            if (isBelowDesktop) {
              if (onCommentClick) onCommentClick(interactionPostId);
              else setCommentsDrawerOpen(true);
            } else if (isRepost) {
              nav(`/post/${post.parent_post_id}`);
            } else {
              setDetailOpen(true);
            }
          }}
          className="px-3 pt-1 text-[11px] text-muted-foreground hover:text-foreground text-left"
        >
          View {counts.comments === 1 ? "1 comment" : `all ${counts.comments} comments`}
        </button>
      )}
      {/* Tagged people — for reposts, surface the ORIGINAL post's tags. */}
      {(() => {
        const tags = isRepost
          ? (post.parent?.tagged_user_ids ?? post.tagged_user_ids)
          : post.tagged_user_ids;
        return tags && tags.length > 0 ? <TaggedPeopleLine ids={tags} /> : null;
      })()}

      {/* Race progress — for reposts this reads/writes against the ORIGINAL
           post so repost shells never inflate rankings or duplicate stats. */}
      <div className="px-3 pt-1 flex items-center justify-end">
        <RaceScopeSelector
          value={raceScope}
          onChange={setRaceScope}
          available={{ city: !!post.city, state: !!post.state, country: !!post.country }}
        />
      </div>
      <RaceProgressBar
        postId={interactionPostId}
        votes={{ crown: counts.crown, fire: counts.fire, diamond: counts.diamond }}
        comments={counts.comments}
        shares={counts.shares}
        battleWins={counts.battleWins}
        fallbackScore={counts.score}
        category={post.category}
        city={post.city}
        state={post.state}
        country={post.country}
        scope={raceScope}
      />


      {/* Actions — Instagram-style row: reactions left, bookmark right-anchored, larger tap targets */}
      <div className="px-2.5 pt-2.5 pb-1 flex items-center gap-1 relative">
        <div className="flex items-center gap-1 relative">
          <VoteBtn type="crown" icon={Crown} color="from-amber-500 to-yellow-600" active={myVotes.has("crown")} burst={burst} showLikes={showLikes} count={counts.crown} onVote={onVote} />
          <VoteBtn type="fire" icon={Flame} color="from-orange-500 to-red-600" active={myVotes.has("fire")} burst={burst} showLikes={showLikes} count={counts.fire} onVote={onVote} />
          <VoteBtn type="diamond" icon={Gem} color="from-cyan-400 to-blue-600" active={myVotes.has("diamond")} burst={burst} showLikes={showLikes} count={counts.diamond} onVote={onVote} />
          <VoteBtn type="dislike" icon={BrokenCrown} color="from-zinc-500 to-zinc-700" active={myVotes.has("dislike")} burst={burst} showLikes={showLikes} count={counts.dislike} onVote={onVote} />
          <VoteBurst
            type={overlayBurst?.type ?? null}
            delta={overlayBurst?.delta}
            onDone={() => setOverlayBurst(null)}
          />
        </div>
        <div className="flex items-center gap-0.5 ml-auto">
          <button
            onClick={() => {
              // Mobile + tablet (<1024px) always use the universal popup
              // comments overlay so users never leave the current screen.
              if (isBelowDesktop) {
                if (onCommentClick) onCommentClick(interactionPostId);
                else setCommentsDrawerOpen(true);
              } else if (isRepost) {
                // Repost shells route to the ORIGINAL post detail so the
                // comment thread is shared with every other repost / original
                // surface, not duplicated per repost row.
                nav(`/post/${post.parent_post_id}`);
              } else {
                setDetailOpen(true);
              }
            }}
            aria-label="Comments"
            className="flex items-center gap-1 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 active:scale-95 transition"
          >
            <MessageCircle size={18} />
            {showComments ? (
              <span className="text-[11px] tabular-nums">{counts.comments}</span>
            ) : (
              <HiddenCountLock kind="comments" />
            )}
          </button>
          {!isOwner && (
            <button
              onClick={() => setGiftOpen(true)}
              className="p-2 rounded-full text-primary hover:bg-primary/10 active:scale-95 transition animate-[crown-pulse_3s_ease-in-out_infinite]"
              aria-label="Send Gift"
            >
              <Gift size={18} />
            </button>
          )}
          <button type="button" onClick={() => setShareOpen(true)} className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 active:scale-95 transition" aria-label="Share">
            <Share2 size={18} />
          </button>
          {/* Hide repost button on repost shells — the server blocks reposts
              of reposts and we surface a "View original" link instead. */}
          {!isOwner && !isRepost && (
            <button type="button" onClick={() => setRepostOpen(true)} className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-muted/50 active:scale-95 transition" aria-label="Repost">
              <Repeat2 size={18} />
            </button>
          )}
          <button
            onClick={toggleBookmark}
            disabled={bookmarkBusy}
            aria-pressed={bookmarked}
            aria-label={bookmarked ? "Remove from saved" : "Save post"}
            className={`p-2 rounded-full transition-colors active:scale-95 hover:bg-muted/50 ${bookmarked ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Bookmark size={18} fill={bookmarked ? "currentColor" : "none"} />
          </button>
        </div>
      </div>
      {/* Category line under vote controls */}
      <div className="px-3 pb-2 pt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <CategoryBadge category={post.category} label={CATEGORY_LABEL[post.category]} size="xs" />
        <span className="opacity-70">competing in</span>
        <span className="font-semibold text-foreground">{CATEGORY_LABEL[post.category]}</span>
      </div>
      {/* Share — for reposts share the ORIGINAL post (id, author, media,
          stats) so share cards credit the original creator. */}
      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        post={
          isRepost
            ? ({
                ...post,
                id: post.parent!.id,
                user_id: post.parent!.user_id,
                image_url: post.parent!.image_url ?? post.image_url,
                image_urls: post.parent!.image_urls ?? post.image_urls ?? null,
                caption: post.parent!.caption ?? "",
                category: (post.parent!.category ?? post.category) as CrownCategory,
                city: post.parent!.city ?? null,
                state: post.parent!.state ?? null,
                country: post.parent!.country ?? null,
                crown_score: post.parent!.crown_score ?? 0,
                vote_count: post.parent!.vote_count ?? 0,
                comment_count: post.parent!.comment_count ?? 0,
                share_count: post.parent!.share_count ?? 0,
                battle_wins: post.parent!.battle_wins ?? 0,
                created_at: post.parent!.created_at ?? post.created_at,
                edited_at: null,
                pinned_at: null,
                parent_post_id: null,
                repost_caption: null,
                media_type: post.parent!.media_type ?? null,
                video_url: post.parent!.video_url ?? null,
                video_poster_url: post.parent!.video_poster_url ?? null,
                filter: post.parent!.filter ?? null,
                alt_texts: post.parent!.alt_texts ?? null,
                tagged_user_ids: post.parent!.tagged_user_ids ?? null,
                is_sensitive: post.parent!.is_sensitive ?? null,
                sensitive_reason: post.parent!.sensitive_reason ?? null,
                profile: post.parent!.profile,
                parent: null,
              } as FeedPost)
            : post
        }
      />
      <GiftPanel
        isOpen={giftOpen}
        onClose={() => setGiftOpen(false)}
        recipient={{
          id: displayUserId,
          username: displayProfile.username,
          avatarUrl: displayProfile.profile_photo_url ?? undefined,
        }}
        postId={interactionPostId}
        onSent={(gift, qty) => {
          setActiveGift(gift);
          setActiveGiftQty(qty);
        }}
      />
      <GiftAnimationOverlay
        gift={activeGift}
        quantity={activeGiftQty}
        onDone={() => setActiveGift(null)}
        anchored
      />
      <CommentsDrawer
        postId={commentsDrawerOpen ? interactionPostId : null}
        onClose={() => setCommentsDrawerOpen(false)}
      />
      {/* Detail dialog is only opened for non-reposts. Reposts navigate
          to /post/<parent_post_id> via the comments button so the original
          author and shared thread are always shown. */}
      {!isRepost && (
        <PostDetailDialog
          post={detailOpen ? {
            ...post,
            caption: liveCaption,
            image_url: liveCover,
            image_urls: liveImageUrls,
            alt_texts: liveAltTexts,
            filter: liveFilter,
            category: liveCategory,
            city: liveCity,
            state: liveState,
            country: liveCountry,
            edited_at: liveEditedAt,
          } : null}
          onClose={() => setDetailOpen(false)}
        />
      )}
      {isOwner && (
        <EditPostDialog
          postId={post.id}
          initialCaption={liveCaption}
          initialCoverUrl={liveCover}
          initialFilter={liveFilter}
          initialCategory={liveCategory}
          initialCity={liveCity}
          initialState={liveState}
          initialCountry={liveCountry}
          initialImageUrls={liveImageUrls ?? undefined}
          initialAltTexts={liveAltTexts ?? undefined}
          initialEditedAt={liveEditedAt ?? undefined}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={(next) => {
            setLiveCaption(next.caption);
            setLiveCover(next.image_url);
            setLiveFilter(next.filter);
            if (next.image_urls) setLiveImageUrls(next.image_urls);
            if (next.alt_texts) setLiveAltTexts(next.alt_texts);
            if (next.category) setLiveCategory(next.category);
            if ("city" in next) setLiveCity(next.city ?? null);
            if ("state" in next) setLiveState(next.state ?? null);
            if ("country" in next) setLiveCountry(next.country ?? null);
            setLiveEditedAt(next.edited_at ?? new Date().toISOString());
            window.dispatchEvent(new CustomEvent("post:updated", { detail: { id: post.id, ...next } }));
          }}
        />
      )}
      {isOwner && (
        <PostInsightsDialog
          postId={post.id}
          open={insightsOpen}
          onOpenChange={setInsightsOpen}
          base={{
            crown_score: post.crown_score,
            vote_count: post.vote_count,
            comment_count: post.comment_count,
            share_count: post.share_count,
            battle_wins: post.battle_wins ?? 0,
            created_at: post.created_at,
          }}
        />
      )}
      <RepostDialog open={repostOpen} onOpenChange={setRepostOpen} parent={post} />
      {/* Reports always target the ORIGINAL post and original author for
          reposts — reporting a repost shell would route to the wrong author
          and skip moderation on the content the user actually saw. */}
      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        postId={interactionPostId}
        reportedUserId={displayUserId}
      />
    </article>
  );
}

// Wrap in React.memo so Feed doesn't re-render all 25 cards when unrelated Feed
// state changes (e.g. loadingMore, openComment, pull-to-refresh dist). The
// rankedPosts useMemo in Feed ensures `post` references are stable across renders,
// so the default shallow-equality check works without a custom comparator.
export default memo(PostCard);
