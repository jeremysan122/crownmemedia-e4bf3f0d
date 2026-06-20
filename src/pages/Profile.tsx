import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, Link, useNavigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Crown, MessageCircle, Settings as SettingsIcon, Share2, Edit3, Camera, Image as ImageIcon, Swords, Heart, Plus, Trash2, Sparkles, Search, Flag, Move, Check, X, MoreVertical, Bookmark, BarChart3, Zap, Pin, PinOff, Archive, Play } from "lucide-react";
import { filterByContentType } from "@/lib/contentType";

import EditPostDialog from "@/components/EditPostDialog";
import PostInsightsDialog from "@/components/PostInsightsDialog";
import CrownLoader from "@/components/CrownLoader";
import ProfileLinks from "@/components/profile/ProfileLinks";
import ProfileCategoryRankings from "@/components/profile/ProfileCategoryRankings";
import { formatScore, locationLabel } from "@/lib/crown";
import { cssFor, isValidFilter } from "@/lib/filters";
import { toast } from "sonner";
import { useSeoMeta, buildProfileOgImage } from "@/hooks/useSeoMeta";
import { trackUsage } from "@/lib/usageTrack";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import PostDetailDialog from "@/components/PostDetailDialog";
import type { FeedPost } from "@/components/PostCard";
import SensitiveThumb from "@/components/SensitiveThumb";
import { useFeedFilters } from "@/hooks/useFeedFilters";
import { fetchPostById } from "@/lib/postQuery";
import UserListDialog from "@/components/profile/UserListDialog";
import ShareProfileDialog from "@/components/profile/ShareProfileDialog";
import RoleBadges from "@/components/profile/RoleBadges";
import ChallengeDialog from "@/components/battles/ChallengeDialog";
import ReportDialog from "@/components/ReportDialog";
import RoyalPassBadge from "@/components/store/RoyalPassBadge";
import { useIsRoyalPassUser } from "@/hooks/useIsRoyalPassUser";
import { useActiveBoost } from "@/hooks/useActiveBoost";
import VerifiedBadge from "@/components/VerifiedBadge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type CrownFilter = "active" | "past" | "all";
type BattleFilter = "newest" | "won" | "lost" | "draw" | "declined";

interface ProfileFull {
  id: string; username: string; bio: string | null;
  profile_photo_url: string | null;
  banner_url: string | null;
  banner_position_y: number | null;
  avatar_position_y: number | null;
  liked_posts_public: boolean;
  city: string | null; state: string | null; country: string | null;
  followers_count: number; following_count: number;
  votes_received: number; votes_given: number;
  crowns_held: number; crowns_total: number; battle_wins: number;
  created_at: string;
}

interface BattleRow {
  id: string; status: string; winner_id: string | null;
  challenger_id: string; opponent_id: string;
  challenger_post_id: string; opponent_post_id: string | null;
  ends_at: string | null;
  posts_c: { image_url: string; city: string | null; country: string | null; category: string | null } | null;
  posts_o: { image_url: string; city: string | null; country: string | null; category: string | null } | null;
  opponent_username: string | null;
  challenger_username: string | null;
}

type PostMenuPosition = { x: number; y: number; placement: "top" | "bottom" };

export default function Profile() {
  const { username } = useParams();
  const { user, profile: me } = useAuth();
  const nav = useNavigate();
  const [prof, setProf] = useState<ProfileFull | null>(null);
  const [crownVoteTotal, setCrownVoteTotal] = useState<number>(0);
  const [posts, setPosts] = useState<{ id: string; image_url: string; crown_score: number; filter: string | null; pinned_at?: string | null; is_sensitive?: boolean | null; content_type?: string | null; media_type?: string | null; video_poster_url?: string | null }[]>([]);
  const [crowns, setCrowns] = useState<{ id: string; title: string; region_name: string; active: boolean; category: string; started_at: string | null; ended_at: string | null }[]>([]);
  const [liked, setLiked] = useState<{ id: string; image_url: string; crown_score: number; is_sensitive?: boolean | null; filter?: string | null; media_type?: string | null; video_poster_url?: string | null; image_urls?: string[] | null }[]>([]);
  const [saved, setSaved] = useState<{ id: string; image_url: string; crown_score: number; is_sensitive?: boolean | null; filter?: string | null; media_type?: string | null; video_poster_url?: string | null; image_urls?: string[] | null }[]>([]);
  const [battles, setBattles] = useState<BattleRow[]>([]);
  const [following, setFollowing] = useState(false);
  const [openPost, setOpenPost] = useState<FeedPost | null>(null);
  const [listMode, setListMode] = useState<"followers" | "following" | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [tab, setTab] = useState("posts");
  const [bannerUploading, setBannerUploading] = useState(false);
  const [crownFilter, setCrownFilter] = useState<CrownFilter>("active");
  const [battleSort, setBattleSort] = useState<BattleFilter>("newest");
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [battleQuery, setBattleQuery] = useState("");
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reframing, setReframing] = useState(false);
  const [draftPosY, setDraftPosY] = useState<number>(50);
  const [reframingAvatar, setReframingAvatar] = useState(false);
  const [draftAvatarPosY, setDraftAvatarPosY] = useState<number>(50);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostData, setEditingPostData] = useState<{ caption: string; image_url: string; filter: any; edited_at?: string | null } | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [postMenuPosition, setPostMenuPosition] = useState<PostMenuPosition | null>(null);
  const [insightsPost, setInsightsPost] = useState<{ id: string; base: { crown_score: number; vote_count: number; comment_count: number; share_count: number; battle_wins: number; created_at: string } } | null>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  const isMe = !username || username === me?.username;
  const targetUsername = isMe ? me?.username : username;
  const royalPassActive = useIsRoyalPassUser(prof?.id);
  const profileGlowActive = useActiveBoost(prof?.id, "profile_glow");
  const { sensitiveMode } = useFeedFilters();
  // Blur thumbnails for non-own profiles unless the viewer chose "show".
  // Author always sees their own posts in clear.
  const shouldBlurThumb = (p: { is_sensitive?: boolean | null }) =>
    !!p.is_sensitive && !isMe && sensitiveMode !== "show";

  useEffect(() => {
    if (!username && me?.username) nav(`/${me.username}`, { replace: true });
  }, [username, me?.username, nav]);

  useEffect(() => {
    const key = isMe ? "self" : (targetUsername ?? "other");
    trackUsage("profile_opened", key);
  }, [isMe, targetUsername]);

  useSeoMeta({
    title: prof ? `@${prof.username} · CrownMe` : "Profile · CrownMe",
    description: prof
      ? `${prof.bio || `Follow @${prof.username} on CrownMe`} · ${prof.crowns_held} crowns held · ${formatScore(prof.votes_received)} votes`
      : "View this royal profile on CrownMe.",
    image: buildProfileOgImage(prof?.username),
    type: "profile",
  });

  // Fix #4: depend on user?.id not the user object to avoid re-running on every auth re-render
  useEffect(() => {
    if (!targetUsername) return;
    let cancelled = false;
    const load = async () => {
      const { data: p, error: pErr } = await supabase
        .from("profiles")
        .select("id, username, profile_photo_url, bio, city, state, country, followers_count, following_count, votes_received, votes_given, crowns_held, crowns_total, battle_wins, is_suspended, created_at, updated_at, banner_url, banner_position_y, avatar_position_y, gender, pronouns, is_private, hide_likes, hide_comments, hide_views, posts_visibility, links, verified, verified_at, liked_posts_public")
        .eq("username", targetUsername)
        .maybeSingle();
      if (cancelled) return;
      if (pErr) { toast.error("Failed to load profile"); return; }
      if (!p) return;
      setProf(p as any);
      const pid = (p as any).id;

      const [{ data: ps, error: psErr }, { data: cs }, { data: rs }] = await Promise.all([
        supabase.from("posts").select("id, image_url, crown_score, filter, pinned_at, is_sensitive, content_type, media_type, video_poster_url").eq("user_id", pid).eq("is_removed", false).order("pinned_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
        supabase.from("crowns").select("id, title, region_name, active, category, started_at, ended_at").eq("user_id", pid).order("started_at", { ascending: false }).limit(40),
        supabase.from("user_roles").select("role").eq("user_id", pid),
      ]);
      if (cancelled) return;
      // Fix #5: surface load errors
      if (psErr) console.error("Failed to load posts:", psErr);
      // Dedupe by id defensively to avoid duplicate keys / duplicated post-options menus
      const uniquePosts = Array.from(new Map(((ps as any) || []).map((row: any) => [row.id, row])).values());
      setPosts(uniquePosts as any);
      setCrowns((cs as any) || []);
      setRoles(((rs as any) || []).map((r: any) => r.role));

      // Tally real crown votes received across this user's posts so the
      // "Total crowns" stat reflects the live counter that grows as people
      // tap the crown button.
      const myPostIds = ((ps as any) || []).map((row: any) => row.id as string);
      if (myPostIds.length) {
        const { data: c } = await supabase.rpc("count_post_votes_by_type", {
          _post_ids: myPostIds,
          _vote_type: "crown",
        });
        if (!cancelled) setCrownVoteTotal(Number(c ?? 0));
      } else {
        setCrownVoteTotal(0);
      }

      // Liked posts (only visible if the profile has liked_posts_public = true,
      // enforced server-side by get_user_liked_post_ids).
      const { data: votes } = await supabase.rpc("get_user_liked_post_ids", {
        _user_id: pid,
        _limit: 60,
      });
      if (cancelled) return;
      const likedIds: string[] = Array.from(
        new Set(((votes as any) || []).map((v: any) => v.post_id as string).filter(Boolean))
      );
      if (likedIds.length) {
        const { data: lp } = await supabase
          .from("posts")
          .select("id, image_url, image_urls, crown_score, is_sensitive, filter, media_type, video_poster_url")
          .in("id", likedIds)
          .eq("is_removed", false);
        if (!cancelled) setLiked((lp as any) || []);
      } else {
        setLiked([]);
      }

      // Saved/bookmarked posts (owner only — RLS restricts to self)
      if (isMe && user?.id) {
        const { data: bms } = await supabase
          .from("post_bookmarks")
          .select("post_id, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(120);
        const bmIds: string[] = Array.from(
          new Set(((bms as any) || []).map((b: any) => b.post_id as string).filter(Boolean))
        );
        if (bmIds.length) {
          const { data: sp } = await supabase
            .from("posts")
            .select("id, image_url, image_urls, crown_score, is_sensitive, filter, media_type, video_poster_url")
            .in("id", bmIds)
            .eq("is_removed", false);
          if (!cancelled) setSaved((sp as any) || []);
        } else {
          if (!cancelled) setSaved([]);
        }
      } else {
        if (!cancelled) setSaved([]);
      }

      // Battles — fetch more than 20 so filter pill counts are accurate
      const { data: bs } = await supabase
        .from("battles")
        .select("id, status, winner_id, challenger_id, opponent_id, challenger_post_id, opponent_post_id, ends_at")
        .or(`challenger_id.eq.${pid},opponent_id.eq.${pid}`)
        .order("created_at", { ascending: false })
        .limit(100); // Fix #3: raised from 20 so pill counts reflect true totals
      if (cancelled) return;
      const battleRows = (bs as any) || [];
      const postIds: string[] = Array.from(new Set(battleRows.flatMap((b: any) => [b.challenger_post_id, b.opponent_post_id]).filter(Boolean) as string[]));
      const userIds: string[] = Array.from(new Set(battleRows.flatMap((b: any) => [b.challenger_id, b.opponent_id]).filter(Boolean) as string[]));
      const postMap: Record<string, { image_url: string; city: string | null; country: string | null; category: string | null }> = {};
      const userMap: Record<string, string> = {};
      if (postIds.length) {
        const { data: bp } = await supabase.from("posts").select("id, image_url, city, country, category").in("id", postIds);
        ((bp as any) || []).forEach((row: any) => { postMap[row.id] = { image_url: row.image_url, city: row.city, country: row.country, category: row.category }; });
      }
      if (userIds.length) {
        const { data: us } = await supabase.from("profiles").select("id, username").in("id", userIds);
        ((us as any) || []).forEach((row: any) => { userMap[row.id] = row.username; });
      }
      if (cancelled) return;
      setBattles(battleRows.map((b: any) => ({
        ...b,
        posts_c: postMap[b.challenger_post_id] || null,
        posts_o: b.opponent_post_id ? postMap[b.opponent_post_id] || null : null,
        challenger_username: userMap[b.challenger_id] || null,
        opponent_username: userMap[b.opponent_id] || null,
      })));

      if (user && user.id !== pid) {
        const { data: f } = await supabase.from("follows").select("id").eq("follower_id", user.id).eq("following_id", pid).maybeSingle();
        if (!cancelled) setFollowing(!!f);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [targetUsername, user?.id]); // Fix #4: user?.id not user

  useEffect(() => {
    if (!openMenuId) return;
    const close = () => {
      setOpenMenuId(null);
      setPostMenuPosition(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenuId]);

  // Cross-platform realtime: keep posts grid in sync with edits/deletes from anywhere.
  useEffect(() => {
    if (!prof?.id) return;
    const onUpdated = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d?.id) return;
      setPosts((prev) => prev.map((p) => p.id === d.id
        ? {
            ...p,
            ...(d.image_url !== undefined ? { image_url: d.image_url } : {}),
            ...(d.filter !== undefined ? { filter: d.filter } : {}),
          }
        : p));
    };
    const onDeleted = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d?.id) return;
      setPosts((prev) => prev.filter((p) => p.id !== d.id));
    };
    window.addEventListener("post:updated", onUpdated);
    window.addEventListener("post:deleted", onDeleted);

    // Record a profile visit (rate-limited server-side to 1/30min per visitor)
    if (user && prof.id && user.id !== prof.id) {
      void supabase.rpc("record_profile_visit", { _profile_id: prof.id }).then(() => {}, () => {});
    }


    const ch = supabase
      .channel(`profile-rt-${prof.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "posts", filter: `user_id=eq.${prof.id}` }, (payload) => {
        const n: any = payload.new;
        setPosts((prev) => prev.map((p) => p.id === n.id ? { ...p, image_url: n.image_url ?? p.image_url, crown_score: n.crown_score ?? p.crown_score, filter: n.filter ?? p.filter } : p));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts", filter: `user_id=eq.${prof.id}` }, (payload) => {
        const o: any = payload.old;
        setPosts((prev) => prev.filter((p) => p.id !== o.id));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "follows", filter: `following_id=eq.${prof.id}` }, async () => {
        // Refresh follower count + my following state
        const { data: fp } = await supabase.from("profiles").select("followers_count").eq("id", prof.id).maybeSingle();
        if (fp) setProf((p) => p ? { ...p, followers_count: (fp as any).followers_count } : p);
        if (user && user.id !== prof.id) {
          const { data: f } = await supabase.from("follows").select("id").eq("follower_id", user.id).eq("following_id", prof.id).maybeSingle();
          setFollowing(!!f);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "votes" }, (payload) => {
        // Recompute Total crowns optimistically based on crown-vote inserts/deletes
        // against any of this profile's posts.
        const row: any = payload.new ?? payload.old;
        if (!row || row.vote_type !== "crown") return;
        const ownsPost = posts.some((p) => p.id === row.post_id);
        if (!ownsPost) return;
        if (payload.eventType === "INSERT") setCrownVoteTotal((n) => n + 1);
        else if (payload.eventType === "DELETE") setCrownVoteTotal((n) => Math.max(0, n - 1));
      })
      .subscribe();

    return () => {
      window.removeEventListener("post:updated", onUpdated);
      window.removeEventListener("post:deleted", onDeleted);
      supabase.removeChannel(ch);
    };
  }, [prof?.id, user?.id]);

  const toggleFollow = async () => {
    if (!user || !prof) return;
    if (following) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", prof.id);
      setFollowing(false);
      // Fix #1: keep stat card in sync
      setProf((p) => p ? { ...p, followers_count: Math.max(0, p.followers_count - 1) } : p);
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: prof.id });
      setFollowing(true);
      // Fix #1: keep stat card in sync
      setProf((p) => p ? { ...p, followers_count: p.followers_count + 1 } : p);
    }
  };

  // Load the FULL canonical post row so the detail dialog matches the feed
  // exactly. Profile thumbnails only carry a few columns — using them as-is
  // would render the dialog with missing media/filter/edits and look like a
  // different post. See src/lib/postQuery.ts.
  const openPostDetail = async (postId: string) => {
    const full = await fetchPostById(postId);
    if (!full) return;
    setOpenPost(full);
  };

  const openPostMenu = (postId: string, button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    const width = 192;
    const gap = 8;
    const x = Math.max(gap, Math.min(window.innerWidth - width - gap, rect.right - width));
    const opensUp = rect.bottom + 256 > window.innerHeight && rect.top > 256;
    setPostMenuPosition({ x, y: opensUp ? rect.top - gap : rect.bottom + gap, placement: opensUp ? "top" : "bottom" });
    setOpenMenuId((current) => (current === postId ? null : postId));
  };

  const onBannerPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !prof) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setBannerUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/banner.${ext}`;
      const { error: upErr } = await supabase.storage.from("banners").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("banners").getPublicUrl(path);
      const url = `${pub.publicUrl}?t=${Date.now()}`;
      const { error: updErr } = await supabase.from("profiles").update({ banner_url: url }).eq("id", user.id);
      if (updErr) throw updErr;
      setProf({ ...prof, banner_url: url });
      toast.success("Banner updated");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setBannerUploading(false);
      if (bannerInput.current) bannerInput.current.value = "";
    }
  };

  const onBannerReset = async () => {
    if (!user || !prof || !prof.banner_url) return;
    setBannerUploading(true);
    try {
      // Best-effort delete from storage (ignore failure if file already gone)
      const { data: list } = await supabase.storage.from("banners").list(user.id);
      if (list && list.length) {
        await supabase.storage.from("banners").remove(list.map((f) => `${user.id}/${f.name}`));
      }
      const { error: updErr } = await supabase.from("profiles").update({ banner_url: null }).eq("id", user.id);
      if (updErr) throw updErr;
      setProf({ ...prof, banner_url: null });
      toast.success("Banner reset to default");
    } catch (err: any) {
      toast.error(err.message || "Reset failed");
    } finally {
      setBannerUploading(false);
    }
  };

  // Restore window scroll when returning to this profile/tab (e.g. back from a post).
  // Keyed by username+tab so each tab keeps its own offset.
  useScrollRestoration(`profile:${targetUsername ?? "self"}:${tab}`, null, {
    ready: !!prof && (
      tab === "posts" ? posts.length > 0 :
      tab === "scrolls" ? posts.length > 0 :
      tab === "crowns" ? crowns.length >= 0 :
      tab === "battles" ? battles.length >= 0 :
      tab === "liked" ? liked.length >= 0 :
      tab === "saved" ? saved.length >= 0 : true
    ),
  });

  if (!prof) {
    return <AppShell><CrownLoader fullscreen={false} label="Loading royal profile…" /></AppShell>;
  }

  const joinedLabel = new Date(prof.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <AppShell>
      {/* Cover banner — visible on all sizes */}
      <div
        data-testid="profile-cover"
        className="relative h-32 sm:h-40 lg:h-52 rounded-none lg:rounded-2xl overflow-hidden bg-gradient-royal border-b lg:border border-border mb-[-40px] sm:mb-[-48px] lg:mb-[-64px]"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        {prof.banner_url ? (
          <img
            src={prof.banner_url}
            alt=""
            className="w-full h-full object-cover"
            style={{ objectPosition: `center ${reframing ? draftPosY : (prof.banner_position_y ?? 50)}%` }}
          />
        ) : (
          <>
            <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "var(--gradient-throne)" }} />
            <div className="absolute -top-10 -right-10 w-72 h-72 rounded-full bg-primary/15 blur-3xl" />
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />
        {isMe && (
          <>
            <input ref={bannerInput} type="file" accept="image/*" hidden onChange={onBannerPick} />
            <div
              className="absolute top-2 right-2 flex gap-1.5 z-20"
              style={{ top: "max(0.5rem, env(safe-area-inset-top, 0px))", right: "max(0.5rem, env(safe-area-inset-right, 0px))" }}
            >
              {reframing ? (
                <>
                  <button
                    data-testid="cover-edit-save"
                    onClick={async () => {
                      if (!user) return;
                      const { error } = await supabase.from("profiles").update({ banner_position_y: draftPosY } as any).eq("id", user.id);
                      if (error) { toast.error(error.message); return; }
                      setProf((p) => p ? { ...p, banner_position_y: draftPosY } : p);
                      setReframing(false);
                      toast.success("Cover reframed");
                    }}
                    className="glass rounded-full p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-background/80"
                    aria-label="Save reframe"
                    title="Save"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    data-testid="cover-edit-cancel"
                    onClick={() => { setDraftPosY(prof.banner_position_y ?? 50); setReframing(false); }}
                    className="glass rounded-full p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-background/80"
                    aria-label="Cancel reframe"
                    title="Cancel"
                  >
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  {prof.banner_url && (
                    <button
                      onClick={() => { setDraftPosY(prof.banner_position_y ?? 50); setReframing(true); }}
                      disabled={bannerUploading}
                      className="glass rounded-full p-2 hover:bg-background/80 transition-colors disabled:opacity-50"
                      aria-label="Reframe cover photo"
                      title="Reframe"
                    >
                      <Move size={14} />
                    </button>
                  )}
                  {prof.banner_url && (
                    <button
                      onClick={() => setResetConfirmOpen(true)}
                      disabled={bannerUploading}
                      className="glass rounded-full p-2 hover:bg-background/80 transition-colors disabled:opacity-50"
                      aria-label="Reset banner to default"
                      title="Reset to default"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => bannerInput.current?.click()}
                    disabled={bannerUploading}
                    className="glass rounded-full p-2 hover:bg-background/80 transition-colors disabled:opacity-50"
                    aria-label="Change banner"
                    title="Change banner"
                  >
                    <Camera size={14} />
                  </button>
                </>
              )}
            </div>
            {reframing && (
              <div
                data-testid="cover-reframe-slider"
                className="absolute left-2 right-2 sm:left-3 sm:right-3 flex items-center gap-3 glass rounded-full px-4 py-2 z-20 shadow-lg"
                style={{
                  top: "calc(max(0.5rem, env(safe-area-inset-top, 0px)) + 3.25rem)",
                  left: "max(0.5rem, env(safe-area-inset-left, 0px))",
                  right: "max(0.5rem, env(safe-area-inset-right, 0px))",
                }}
              >
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Reframe</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={draftPosY}
                  onChange={(e) => setDraftPosY(Number(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "Home") { e.preventDefault(); setDraftPosY(0); }
                    else if (e.key === "End") { e.preventDefault(); setDraftPosY(100); }
                  }}
                  className="flex-1 accent-primary cursor-pointer h-11 touch-none"
                  style={{ WebkitAppearance: "none", background: "transparent" }}
                  aria-label="Vertical cover position"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={draftPosY}
                />
                <span className="text-[10px] tabular-nums w-9 text-right shrink-0">{draftPosY}%</span>
              </div>
            )}
          </>
        )}
      </div>


      <div className="px-4 lg:px-6 py-4 lg:relative">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <div data-testid="profile-avatar" className={`self-start w-fit ${prof.crowns_held > 0 ? "crown-ring" : ""} lg:ring-4 lg:ring-background lg:rounded-full relative z-10 ${royalPassActive ? "ring-2 ring-gold rounded-full p-0.5" : ""} ${(profileGlowActive || royalPassActive) ? "profile-glow" : ""}`}>
            <div className="size-20 lg:size-32 rounded-full overflow-hidden bg-muted ring-2 ring-border relative">
              {prof.profile_photo_url && (
                <img
                  src={prof.profile_photo_url}
                  className="w-full h-full object-cover"
                  alt=""
                  style={{ objectPosition: `center ${prof.avatar_position_y ?? 50}%` }}
                />
              )}
            </div>
          </div>
          <div className="flex-1 lg:pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-xl lg:text-3xl">@{prof.username}</h1>
              {(prof as any).verified && <VerifiedBadge size={20} />}
              {prof.crowns_held > 0 && <Crown size={18} className="text-primary" fill="currentColor" />}
              {royalPassActive && <RoyalPassBadge showLabel />}
              <RoleBadges roles={roles} crownsHeld={prof.crowns_held} />
            </div>
            <p className="text-xs lg:text-sm text-muted-foreground">
              {locationLabel(prof)} · Member since {joinedLabel}
              {(prof as any).pronouns && (
                <> · <span className="text-foreground/80">{(prof as any).pronouns}</span></>
              )}
            </p>
            {prof.bio && <p className="text-sm mt-1 max-w-xl">{prof.bio}</p>}
            <ProfileLinks links={(prof as any).links} />
          </div>

          {/* Desktop action buttons */}
          <div className="hidden lg:flex gap-2 lg:pb-2">
            {isMe ? (
              <>
                <Button onClick={() => nav("/edit-profile")} variant="outline"><Edit3 size={14} className="mr-1.5" /> Edit Profile</Button>
                <Button onClick={() => nav("/insights")} variant="outline" title="Insights"><BarChart3 size={14} className="mr-1.5" /> Insights</Button>
                <Button onClick={() => setShareOpen(true)} variant="outline" size="icon" aria-label="Share profile"><Share2 size={16} /></Button>
                <Button onClick={() => nav("/settings")} variant="outline" size="icon" aria-label="Settings"><SettingsIcon size={16} /></Button>
              </>
            ) : (
              <>
                <Button onClick={toggleFollow} className={following ? "" : "bg-gradient-gold text-primary-foreground"} variant={following ? "outline" : "default"}>
                  {following ? "Following" : "Follow"}
                </Button>
                <Button onClick={() => nav(`/messages/${prof.id}`)} variant="outline"><MessageCircle size={14} className="mr-1.5" /> Message</Button>
                <Button onClick={() => setChallengeOpen(true)} variant="outline" className="border-primary/50 text-primary hover:bg-primary/10">
                  <Swords size={14} className="mr-1.5" /> Challenge
                </Button>
                <Button variant="outline" size="icon" onClick={() => setShareOpen(true)} aria-label="Share profile">
                  <Share2 size={14} />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setReportOpen(true)} aria-label="Report user" className="text-destructive hover:text-destructive">
                  <Flag size={14} />
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 lg:grid-cols-6 gap-2 my-4 lg:my-6">
          {[
            { v: prof.followers_count, l: "Followers", click: () => setListMode("followers") },
            { v: prof.following_count, l: "Following", click: () => setListMode("following") },
            { v: prof.crowns_held, l: "Crowns" },
            { v: prof.battle_wins, l: "Wins" },
            { v: prof.votes_received, l: "Votes In" },
            { v: prof.votes_given, l: "Votes Out" },
          ].map((s, i) => {
            const Comp: any = s.click ? "button" : "div";
            return (
              <Comp
                key={s.l}
                onClick={s.click}
                className={`text-center royal-card py-2.5 ${i >= 4 ? "hidden lg:block" : ""} ${s.click ? "cursor-pointer hover:bg-muted/40 transition-colors focus:outline-none focus:ring-2 focus:ring-primary" : ""}`}
              >
                <div className="font-display text-base lg:text-lg text-gold">{formatScore(s.v)}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.l}</div>
              </Comp>
            );
          })}
        </div>

        {/* Mobile action buttons */}
        <div className="flex gap-2 lg:hidden">
          {isMe ? (
            <>
              <Button onClick={() => nav("/edit-profile")} variant="outline" className="flex-1"><Edit3 size={14} className="mr-1" /> Edit Profile</Button>
              <Button onClick={() => nav("/insights")} variant="outline" size="icon" aria-label="Insights"><BarChart3 size={16} /></Button>
              <Button onClick={() => setShareOpen(true)} variant="outline" size="icon" aria-label="Share profile"><Share2 size={16} /></Button>
              <Button onClick={() => nav("/settings")} variant="outline" size="icon" aria-label="Settings"><SettingsIcon size={16} /></Button>
            </>
          ) : (
            <>
              <Button onClick={toggleFollow} className={`flex-1 ${following ? "" : "bg-gradient-gold text-primary-foreground"}`} variant={following ? "outline" : "default"}>
                {following ? "Following" : "Follow"}
              </Button>
              <Button onClick={() => nav(`/messages/${prof.id}`)} variant="outline" size="icon" aria-label="Message"><MessageCircle size={16} /></Button>
              <Button onClick={() => setChallengeOpen(true)} variant="outline" size="icon" aria-label="Challenge to Crown Battle" className="border-primary/50 text-primary">
                <Swords size={16} />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setShareOpen(true)} aria-label="Share profile">
                <Share2 size={16} />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setReportOpen(true)} aria-label="Report user" className="text-destructive">
                <Flag size={16} />
              </Button>
            </>
          )}
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-6 mt-2">
          <div>
            <ProfileCategoryRankings userId={prof.id} />



            {(() => {
              const showLiked = isMe || (prof.liked_posts_public ?? true);
              const showSaved = isMe;
              // +1 for the new Scrolls tab. Profile now separates normal Posts
              // from vertical Scrolls (shorts/reels) per the content-type split.
              const colCount = 4 + (showLiked ? 1 : 0) + (showSaved ? 1 : 0);
              const colsClass = colCount === 6 ? "grid-cols-6" : colCount === 5 ? "grid-cols-5" : "grid-cols-4";
              const imagePosts = filterByContentType(posts as any, "post") as typeof posts;
              const scrollPosts = filterByContentType(posts as any, "scroll") as typeof posts;
              const renderTile = (p: typeof posts[number], showPlay: boolean) => (
                <div
                  key={p.id}
                  className={`${showPlay ? "aspect-[9/16]" : "aspect-square"} bg-muted overflow-hidden relative rounded-md lg:rounded-xl group`}
                >
                  <button
                    type="button"
                    onClick={() => openPostDetail(p.id)}
                    className="absolute inset-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
                    aria-label={showPlay ? "Open scroll" : "Open post"}
                  >
                    <img
                      src={(showPlay && p.video_poster_url) ? p.video_poster_url : p.image_url}
                      className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]"
                      style={isValidFilter(p.filter) && p.filter && p.filter !== "none" ? { filter: cssFor(p.filter as any) } : undefined}
                      alt=""
                    />
                    <SensitiveThumb blurred={shouldBlurThumb(p)} />
                  </button>
                  {showPlay && (
                    <>
                      {/* Reels-style gradient + centered play affordance + view count */}
                      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
                      <div className="absolute top-1.5 left-1.5 glass rounded-full p-1 pointer-events-none">
                        <Play size={11} fill="currentColor" />
                      </div>
                    </>
                  )}
                  <div className="absolute bottom-1 right-1 glass px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 pointer-events-none">
                    <Crown size={8} className="text-primary" fill="currentColor" />{formatScore(p.crown_score)}
                  </div>
                  {isMe && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); openPostMenu(p.id, e.currentTarget); }}
                      className="absolute top-1 right-1 z-20 glass rounded-full p-1 opacity-90 hover:opacity-100"
                      aria-label="Post actions"
                      aria-expanded={openMenuId === p.id}
                    >
                      <MoreVertical size={12} />
                    </button>
                  )}
                </div>
              );
              return (
            <Tabs value={tab} onValueChange={setTab} className="mt-5">
              <TabsList className={`grid w-full ${colsClass}`}>
                <TabsTrigger value="posts" className="text-xs gap-1"><ImageIcon size={12} /> Posts</TabsTrigger>
                <TabsTrigger value="scrolls" className="text-xs gap-1"><Play size={12} /> Scrolls</TabsTrigger>
                <TabsTrigger value="crowns" className="text-xs gap-1"><Crown size={12} /> Crowns</TabsTrigger>
                <TabsTrigger value="battles" className="text-xs gap-1"><Swords size={12} /> Battles</TabsTrigger>
                {showLiked && <TabsTrigger value="liked" className="text-xs gap-1"><Heart size={12} /> Liked</TabsTrigger>}
                {showSaved && <TabsTrigger value="saved" className="text-xs gap-1"><Bookmark size={12} /> Saved</TabsTrigger>}
              </TabsList>

              <TabsContent value="posts" className="mt-3">
                {imagePosts.length > 0 ? (
                  <div className="grid grid-cols-3 gap-1 lg:gap-2">
                    {imagePosts.map((p) => renderTile(p, false))}
                  </div>
                ) : (
                  <EmptyState
                    icon={<ImageIcon size={28} className="text-muted-foreground" />}
                    title={isMe ? "Claim your first crown" : "No posts yet"}
                    body={isMe ? "Upload your first photo and start competing for the throne." : "This royal hasn't posted yet."}
                    cta={isMe ? { label: "Upload Photo", icon: <Plus size={14} />, onClick: () => nav("/upload") } : undefined}
                  />
                )}
              </TabsContent>

              <TabsContent value="scrolls" className="mt-3">
                {scrollPosts.length > 0 ? (
                  <div className="grid grid-cols-3 gap-1 lg:gap-2">
                    {scrollPosts.map((p) => renderTile(p, true))}
                  </div>
                ) : (
                  <EmptyState
                    icon={<Play size={28} className="text-muted-foreground" />}
                    title={isMe ? "Share your first Scroll" : "No scrolls yet"}
                    body={isMe ? "Record a vertical 9:16 short for the Scrolls feed." : "This royal hasn't shared any scrolls yet."}
                    cta={isMe ? { label: "Create Scroll", icon: <Plus size={14} />, onClick: () => nav("/upload?type=scroll") } : undefined}
                  />
                )}
              </TabsContent>



              <TabsContent value="crowns" className="mt-3">
                {crowns.length > 0 ? (
                  <>
                    <div className="flex gap-1.5 mb-3 overflow-x-auto scrollbar-none">
                      {([
                        { v: "active", l: "Active", n: crowns.filter((c) => c.active).length },
                        { v: "past", l: "Past", n: crowns.filter((c) => !c.active).length },
                        { v: "all", l: "All", n: crowns.length },
                      ] as { v: CrownFilter; l: string; n: number }[]).map((f) => (
                        <button
                          key={f.v}
                          onClick={() => setCrownFilter(f.v)}
                          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                            crownFilter === f.v
                              ? "bg-gradient-gold text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/70"
                          }`}
                        >
                          {f.l} <span className="opacity-70">({f.n})</span>
                        </button>
                      ))}
                    </div>
                    {(() => {
                      const filtered = crowns.filter((c) =>
                        crownFilter === "all" ? true : crownFilter === "active" ? c.active : !c.active
                      );
                      if (filtered.length === 0) {
                        return (
                          <EmptyState
                            icon={<Crown size={28} className="text-muted-foreground" />}
                            title={crownFilter === "active" ? "No active crowns" : "No past crowns"}
                            body={crownFilter === "active" ? "You don't currently hold any crowns." : "No reigns have ended yet."}
                          />
                        );
                      }
                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {filtered.map((c) => (
                            <div key={c.id} className={`royal-card p-3 flex items-center gap-3 ${c.active ? "border-primary/40" : ""}`}>
                              <div className={`size-10 rounded-full flex items-center justify-center ${c.active ? "bg-gradient-gold" : "bg-muted"}`}>
                                <Crown size={16} className={c.active ? "text-primary-foreground" : "text-muted-foreground"} fill="currentColor" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold truncate">{c.region_name}</p>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                  {c.category.replace(/_/g, " ")} · {c.active ? "Active" : "Past"}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <EmptyState
                    icon={<Crown size={28} className="text-muted-foreground" />}
                    title="No crowns yet"
                    body={isMe ? "Win votes to claim regional and category crowns." : "No crowns earned yet."}
                    cta={isMe ? { label: "Browse Leaderboard", onClick: () => nav("/leaderboard") } : undefined}
                  />
                )}
              </TabsContent>

              <TabsContent value="battles" className="mt-3">
                {battles.length > 0 ? (
                  <>
                    <div className="relative mb-2.5">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="search"
                        value={battleQuery}
                        onChange={(e) => setBattleQuery(e.target.value)}
                        placeholder="Search by opponent, region, or category…"
                        className="w-full h-9 pl-9 pr-3 rounded-full bg-input/70 border border-border focus:border-primary/60 focus:outline-none text-xs placeholder:text-muted-foreground/70"
                      />
                    </div>
                    {(() => {
                      const nowMs = Date.now();
                      const isLive = (b: any) =>
                        (b.status === "active" || b.status === "pending") &&
                        (!b.ends_at || new Date(b.ends_at).getTime() > nowMs);
                      const counts = {
                        newest: battles.filter(isLive).length,
                        won: battles.filter((b) => b.winner_id === prof.id).length,
                        lost: battles.filter((b) => b.status === "completed" && b.winner_id && b.winner_id !== prof.id).length,
                        draw: battles.filter((b) => b.status === "completed" && !b.winner_id).length,
                        declined: battles.filter((b) => b.status === "declined" || b.status === "cancelled").length,
                      };
                      return (
                        <div className="flex gap-1.5 mb-3 overflow-x-auto scrollbar-none">
                          {([
                            { v: "newest", l: "Active", n: counts.newest },
                            { v: "won", l: "Won", n: counts.won },
                            { v: "lost", l: "Lost", n: counts.lost },
                            { v: "draw", l: "Draw", n: counts.draw },
                            { v: "declined", l: "Declined", n: counts.declined },
                          ] as { v: BattleFilter; l: string; n: number }[]).map((f) => (
                            <button
                              key={f.v}
                              onClick={() => setBattleSort(f.v)}
                              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                                battleSort === f.v
                                  ? "bg-gradient-gold text-primary-foreground"
                                  : "bg-muted text-muted-foreground hover:bg-muted/70"
                              }`}
                            >
                              {f.l} <span className="opacity-70">({f.n})</span>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                    {(() => {
                      const term = battleQuery.trim().toLowerCase();
                      const nowMs = Date.now();
                      const filtered = battles.filter((b) => {
                        if (battleSort === "newest") {
                          const live = (b.status === "active" || b.status === "pending") &&
                            (!b.ends_at || new Date(b.ends_at).getTime() > nowMs);
                          if (!live) return false;
                        }
                        if (battleSort === "won" && b.winner_id !== prof.id) return false;
                        if (battleSort === "lost" && !(b.status === "completed" && b.winner_id && b.winner_id !== prof.id)) return false;
                        if (battleSort === "draw" && !(b.status === "completed" && !b.winner_id)) return false;
                        if (battleSort === "declined" && !(b.status === "declined" || b.status === "cancelled")) return false;
                        if (!term) return true;
                        const opp = b.challenger_id === prof.id ? b.opponent_username : b.challenger_username;
                        const haystack = [
                          opp,
                          b.posts_c?.city, b.posts_c?.country, b.posts_c?.category,
                          b.posts_o?.city, b.posts_o?.country, b.posts_o?.category,
                        ].filter(Boolean).join(" ").toLowerCase();
                        return haystack.includes(term);
                      });
                      if (filtered.length === 0) {
                        return (
                          <EmptyState
                            icon={<Swords size={28} className="text-muted-foreground" />}
                            title={term ? "No matching battles" : `No ${battleSort === "newest" ? "battles" : battleSort + " battles"}`}
                            body={term ? `Nothing matches "${battleQuery}". Try another opponent or region.` : "Try a different filter or jump into a new Crown Battle."}
                            cta={isMe && !term ? { label: "Find Battles", onClick: () => nav("/battles") } : undefined}
                          />
                        );
                      }
                      return (
                        <div className="space-y-2">
                          {filtered.map((b) => {
                            const won = b.winner_id === prof.id;
                            const lost = b.status === "completed" && b.winner_id && b.winner_id !== prof.id;
                            const draw = b.status === "completed" && !b.winner_id;
                            const label = b.status === "completed" ? (won ? "Won" : lost ? "Lost" : "Draw") : b.status;
                            const labelClass = won
                              ? "text-primary"
                              : lost
                              ? "text-destructive"
                              : draw
                              ? "text-muted-foreground"
                              : "text-foreground";
                            const opp = b.challenger_id === prof.id ? b.opponent_username : b.challenger_username;
                            const region = [b.posts_c?.city || b.posts_o?.city, b.posts_c?.country || b.posts_o?.country].filter(Boolean).join(", ");
                            return (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() => nav(`/battles/${b.id}`)}
                                className="royal-card p-3 flex items-center gap-3 w-full text-left min-h-[64px] cursor-pointer hover:bg-muted/40 active:scale-[0.99] transition-all focus:outline-none focus:ring-2 focus:ring-primary/60 touch-manipulation"
                                aria-label="Open battle details"
                              >
                                <div className="flex gap-1 pointer-events-none">
                                  {b.posts_c?.image_url && <img loading="lazy" src={b.posts_c.image_url} alt="" className="size-12 rounded-md object-cover" />}
                                  {b.posts_o?.image_url && <img loading="lazy" src={b.posts_o.image_url} alt="" className="size-12 rounded-md object-cover" />}
                                </div>
                                <div className="flex-1 min-w-0 pointer-events-none">
                                  <p className={`text-xs font-semibold uppercase tracking-wider ${labelClass}`}>{label}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">
                                    {opp ? `vs @${opp}` : "Crown Battle"}{region ? ` · ${region}` : ""}
                                  </p>
                                </div>
                                {won && <span className="text-[10px] bg-gradient-gold text-primary-foreground px-2 py-0.5 rounded-full font-bold pointer-events-none">+ Crown</span>}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <EmptyState
                    icon={<Swords size={28} className="text-muted-foreground" />}
                    title="No battles yet"
                    body={isMe ? "Challenge another royal to a Crown Battle." : "No battles fought yet."}
                    cta={isMe ? { label: "Find Battles", onClick: () => nav("/battles") } : undefined}
                  />
                )}
              </TabsContent>

              <TabsContent value="liked" className="mt-3">
                {liked.length > 0 ? (
                  <div className="grid grid-cols-3 gap-1 lg:gap-2">
                    {liked.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => openPostDetail(p.id)}
                        className="aspect-square bg-muted overflow-hidden relative rounded-md lg:rounded-xl group cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
                        aria-label="Open post"
                      >
                        <img loading="lazy" src={(p.media_type === "video" && p.video_poster_url) || p.image_url || p.image_urls?.[0] || ""} style={{ filter: cssFor(isValidFilter(p.filter) ? (p.filter as any) : null) }} className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]" alt="" />
                        <SensitiveThumb blurred={shouldBlurThumb(p)} />
                        <div className="absolute bottom-1 right-1 glass px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1">
                          <Heart size={8} className="text-primary" fill="currentColor" />{formatScore(p.crown_score)}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={<Sparkles size={28} className="text-primary" />}
                    title={isMe ? "Discover royals worth a vote" : "No likes yet"}
                    body={
                      isMe
                        ? "Tap the crown on any post you love. Your gallery of royal picks will live right here."
                        : "Nothing liked yet."
                    }
                    cta={isMe ? { label: "Explore the Feed", icon: <Heart size={14} />, onClick: () => nav("/") } : undefined}
                  />
                )}
              </TabsContent>

              {isMe && (
                <TabsContent value="saved" className="mt-3">
                  {saved.length > 0 ? (
                    <div className="grid grid-cols-3 gap-1 lg:gap-2">
                      {saved.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => openPostDetail(p.id)}
                          className="aspect-square bg-muted overflow-hidden relative rounded-md lg:rounded-xl group cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
                          aria-label="Open post"
                        >
                          <img loading="lazy" src={p.image_url} className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]" alt="" />
                          <SensitiveThumb blurred={shouldBlurThumb(p)} />
                          <div className="absolute bottom-1 right-1 glass px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1">
                            <Bookmark size={8} className="text-primary" fill="currentColor" />{formatScore(p.crown_score)}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={<Bookmark size={28} className="text-primary" />}
                      title="No saved posts yet"
                      body="Tap the bookmark on any post to keep it here for later — only you can see this gallery."
                      cta={{ label: "Explore the Feed", icon: <Heart size={14} />, onClick: () => nav("/feed") }}
                    />
                  )}
                </TabsContent>
              )}
            </Tabs>
              );
            })()}
          </div>

          {/* Desktop side panels */}
          <aside className="hidden lg:block space-y-4 mt-5">
            <div className="royal-card p-4">
              <h4 className="font-display text-sm tracking-widest text-gold mb-2">Reign Summary</h4>
              <div className="text-xs space-y-1.5 text-muted-foreground">
                <div className="flex justify-between"><span>Active crowns</span><span className="text-foreground font-semibold">{prof.crowns_held}</span></div>
                <div className="flex justify-between"><span>Total crowns</span><span className="text-foreground font-semibold tabular-nums">{crownVoteTotal}</span></div>
                <div className="flex justify-between"><span>Battle wins</span><span className="text-foreground font-semibold">{prof.battle_wins}</span></div>
                <div className="flex justify-between"><span>Member since</span><span className="text-foreground font-semibold">{joinedLabel}</span></div>
              </div>
              {crowns.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/60">
                  <h5 className="font-display text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Reign History</h5>
                  <div className="flex flex-wrap gap-1.5">
                    {crowns.slice(0, 12).map((c) => (
                      <div key={c.id} className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1 ${c.active ? "bg-gradient-gold text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        <Crown size={10} fill="currentColor" />
                        <span className="font-semibold">{c.region_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>

        </div>
      </div>

      {openMenuId && postMenuPosition && createPortal((() => {
        const menuPost = posts.find((p) => p.id === openMenuId);
        if (!menuPost) return null;
        const closeMenu = () => { setOpenMenuId(null); setPostMenuPosition(null); };
        return (
          <div
            role="menu"
            aria-label="Post actions"
            className="fixed z-[70] w-48 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
            style={{ left: postMenuPosition.x, top: postMenuPosition.y, transform: postMenuPosition.placement === "top" ? "translateY(-100%)" : undefined }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className="relative flex w-full select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
              onClick={async () => {
                closeMenu();
                const { data } = await supabase
                  .from("posts")
                  .select("caption, image_url, filter, edited_at")
                  .eq("id", menuPost.id)
                  .maybeSingle();
                if (!data) { toast.error("Could not load post"); return; }
                setEditingPostData({
                  caption: (data as any).caption ?? "",
                  image_url: (data as any).image_url ?? menuPost.image_url,
                  filter: (data as any).filter ?? null,
                  edited_at: (data as any).edited_at ?? null,
                });
                setEditingPostId(menuPost.id);
              }}
            >
              <Edit3 size={12} className="mr-2" /> Edit post
            </button>
            <button
              type="button"
              role="menuitem"
              className="relative flex w-full select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
              onClick={async () => {
                closeMenu();
                const { data } = await supabase
                  .from("posts")
                  .select("crown_score, vote_count, comment_count, share_count, battle_wins, created_at")
                  .eq("id", menuPost.id)
                  .maybeSingle();
                if (!data) { toast.error("Could not load post"); return; }
                setInsightsPost({ id: menuPost.id, base: data as any });
              }}
            >
              <BarChart3 size={12} className="mr-2" /> Insights
            </button>
            <button
              type="button"
              role="menuitem"
              className="relative flex w-full select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
              onClick={() => { closeMenu(); nav("/store?tab=boosts"); }}
            >
              <Zap size={12} className="mr-2" /> Boost this post
            </button>
            <button
              type="button"
              role="menuitem"
              className="relative flex w-full select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
              onClick={async () => {
                closeMenu();
                if (!user) return;
                const next = menuPost.pinned_at ? null : new Date().toISOString();
                const { error } = await supabase
                  .from("posts")
                  .update({ pinned_at: next } as any)
                  .eq("id", menuPost.id)
                  .eq("user_id", user.id);
                if (error) return toast.error(error.message);
                setPosts((prev) => prev.map((pp) => pp.id === menuPost.id ? { ...pp, pinned_at: next } : pp));
                toast.success(next ? "Pinned to your profile" : "Unpinned");
              }}
            >
              {menuPost.pinned_at
                ? <><PinOff size={12} className="mr-2" /> Unpin from profile</>
                : <><Pin size={12} className="mr-2" /> Pin to profile</>}
            </button>
            <button
              type="button"
              role="menuitem"
              className="relative flex w-full select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
              onClick={async () => {
                closeMenu();
                if (!user) return;
                const { error } = await supabase
                  .from("posts")
                  .update({ is_archived: true, archived_at: new Date().toISOString() } as any)
                  .eq("id", menuPost.id)
                  .eq("user_id", user.id);
                if (error) return toast.error(error.message);
                setPosts((prev) => prev.filter((pp) => pp.id !== menuPost.id));
                toast.success("Post archived — find it in Settings → Archived");
              }}
            >
              <Archive size={12} className="mr-2" /> Archive
            </button>
            <div className="-mx-1 my-1 h-px bg-muted" />
            <button
              type="button"
              role="menuitem"
              className="relative flex w-full select-none items-center rounded-sm px-2 py-1.5 text-sm text-destructive outline-none transition-colors hover:bg-accent focus:bg-accent focus:text-destructive"
              onClick={() => { closeMenu(); setDeletingPostId(menuPost.id); }}
            >
              <Trash2 size={12} className="mr-2" /> Delete post
            </button>
          </div>
        );
      })(), document.body)}

      <PostDetailDialog post={openPost} onClose={() => setOpenPost(null)} />

      {insightsPost && (
        <PostInsightsDialog
          postId={insightsPost.id}
          base={insightsPost.base}
          open={!!insightsPost}
          onOpenChange={(o) => { if (!o) setInsightsPost(null); }}
        />
      )}

      {listMode && (
        <UserListDialog
          open={!!listMode}
          onOpenChange={(b) => !b && setListMode(null)}
          userId={prof.id}
          mode={listMode}
        />
      )}

      <ShareProfileDialog open={shareOpen} onOpenChange={setShareOpen} profile={prof} roles={roles} />

      {!isMe && (
        <>
          <ChallengeDialog
            open={challengeOpen}
            onOpenChange={setChallengeOpen}
            presetOpponentId={prof.id}
            onCreated={() => { toast.success("Challenge sent — track it on the Battles page."); }}
          />
          <ReportDialog
            open={reportOpen}
            onOpenChange={setReportOpen}
            reportedUserId={prof.id}
          />
        </>
      )}

      {editingPostId && editingPostData && (
        <EditPostDialog
          postId={editingPostId}
          initialCaption={editingPostData.caption}
          initialCoverUrl={editingPostData.image_url}
          initialFilter={editingPostData.filter}
          initialEditedAt={editingPostData.edited_at ?? undefined}
          open={!!editingPostId}
          onOpenChange={(o) => { if (!o) { setEditingPostId(null); setEditingPostData(null); } }}
          onSaved={(next) => {
            setPosts((prev) => prev.map((p) => p.id === editingPostId ? { ...p, image_url: next.image_url } : p));
            window.dispatchEvent(new CustomEvent("post:updated", { detail: { id: editingPostId, image_url: next.image_url, edited_at: next.edited_at } }));
          }}
        />
      )}

      <AlertDialog open={!!deletingPostId} onOpenChange={(o) => !o && setDeletingPostId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-gold">Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the post and its votes from your profile and the feed. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep post</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const id = deletingPostId;
                if (!id) return;
                const { error } = await supabase.from("posts").delete().eq("id", id);
                if (error) { toast.error(error.message); return; }
                setPosts((prev) => prev.filter((p) => p.id !== id));
                window.dispatchEvent(new CustomEvent("post:deleted", { detail: { id } }));
                toast.success("Post deleted");
                setDeletingPostId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-gold">Reset banner to default?</AlertDialogTitle>
            <AlertDialogDescription>
              Your custom cover image will be removed and your profile will return to the luxury gradient. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bannerUploading}>Keep banner</AlertDialogCancel>
            <AlertDialogAction
              disabled={bannerUploading}
              onClick={async () => {
                await onBannerReset();
                setResetConfirmOpen(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reset to default
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function EmptyState({ icon, title, body, cta }: { icon: React.ReactNode; title: string; body: string; cta?: { label: string; icon?: React.ReactNode; onClick: () => void } }) {
  return (
    <div className="royal-card py-10 px-4 text-center flex flex-col items-center gap-2">
      <div className="size-14 rounded-full bg-muted/50 flex items-center justify-center mb-1">{icon}</div>
      <h4 className="font-display text-base text-gold">{title}</h4>
      <p className="text-xs text-muted-foreground max-w-xs">{body}</p>
      {cta && (
        <Button onClick={cta.onClick} className="bg-gradient-gold text-primary-foreground mt-2">
          {cta.icon && <span className="mr-1.5">{cta.icon}</span>}
          {cta.label}
        </Button>
      )}
    </div>
  );
}
