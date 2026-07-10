import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Search, Swords, Loader2, Radio } from "lucide-react";
import { CATEGORY_LABEL, CrownCategory } from "@/lib/crown";
import { cssFor, isValidFilter, type FilterId } from "@/lib/filters";
import { RoyalThumbSkeleton } from "@/components/royal/RoyalSkeleton";
import { battleErrorMessage } from "@/lib/battlesErrors";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { createLiveBattle, liveBattleErrorMessage } from "@/lib/liveBattles";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  presetOpponentId?: string | null;
  onCreated?: () => void;
}

interface UserResult { id: string; username: string; profile_photo_url: string | null; }
interface PostThumb { id: string; image_url: string; category: CrownCategory; filter: string | null; }

export default function ChallengeDialog({ open, onOpenChange, presetOpponentId, onCreated }: Props) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"post" | "live">("post");
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [opponent, setOpponent] = useState<UserResult | null>(null);
  const [myPosts, setMyPosts] = useState<PostThumb[]>([]);
  const [postId, setPostId] = useState<string>("");
  const [duration, setDuration] = useState<string>("24");
  const [liveDuration, setLiveDuration] = useState<string>("300"); // seconds
  const [category, setCategory] = useState<CrownCategory>("overall");
  const [submitting, setSubmitting] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [searching, setSearching] = useState(false);

  // Load live-battles feature flag once.
  useEffect(() => {
    isFeatureEnabled("live_battles_enabled").then(setLiveEnabled).catch(() => setLiveEnabled(false));
  }, []);

  useEffect(() => {
    if (!open) {
      setStep(1); setSearch(""); setResults([]); setOpponent(null);
      setPostId(""); setDuration("24"); setLiveDuration("300");
      setCategory("overall"); setMode("post");
      return;
    }
    if (user) {
      setLoadingPosts(true);
      // Battle-eligible posts only: mine, not removed, not archived, not a repost, `post` content type.
      supabase.from("posts").select("id, image_url, category, filter, is_archived, parent_post_id, content_type, moderation_status")
        .eq("user_id", user.id)
        .eq("is_removed", false)
        .eq("is_archived", false)
        .is("parent_post_id", null)
        .order("created_at", { ascending: false }).limit(48)
        .then(({ data }) => {
          const posts = ((data as any[]) || [])
            .filter((p) => (p.content_type == null || p.content_type === "post"))
            .filter((p) => !p.moderation_status || !["removed", "flagged"].includes(p.moderation_status))
            .map((p): PostThumb => ({ id: p.id, image_url: p.image_url, category: p.category, filter: p.filter }));
          setMyPosts(posts);
          if (posts[0]) { setPostId(posts[0].id); setCategory(posts[0].category); }
          setLoadingPosts(false);
        });
    }
    if (presetOpponentId) {
      supabase.from("profiles").select("id, username, profile_photo_url, is_banned, is_suspended")
        .eq("id", presetOpponentId).maybeSingle()
        .then(({ data }) => {
          const d = data as any;
          if (d && !d.is_banned && !d.is_suspended) {
            setOpponent({ id: d.id, username: d.username, profile_photo_url: d.profile_photo_url });
            setStep(2);
          } else if (d) {
            toast.error("This royal can't be challenged right now.");
          }
        });
    }
  }, [open, user, presetOpponentId]);

  useEffect(() => {
    if (!search.trim() || step !== 1) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const [profRes, blkRes] = await Promise.all([
          supabase.from("profiles")
            .select("id, username, profile_photo_url, is_banned, is_suspended")
            .ilike("username", `%${search.trim()}%`)
            .neq("id", user?.id || "")
            .limit(16),
          user
            ? supabase.from("blocks").select("blocker_id, blocked_id")
                .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        const blocked = new Set<string>();
        for (const b of (blkRes.data as any[]) || []) {
          blocked.add(b.blocker_id === user?.id ? b.blocked_id : b.blocker_id);
        }
        const filtered = ((profRes.data as any[]) || [])
          .filter((p) => !p.is_banned && !p.is_suspended)
          .filter((p) => !blocked.has(p.id))
          .slice(0, 8)
          .map((p): UserResult => ({ id: p.id, username: p.username, profile_photo_url: p.profile_photo_url }));
        setResults(filtered);
      } catch (e) {
        console.error("[challenge] search failed", e);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [search, step, user]);

  const submit = async () => {
    if (!user || !opponent || !postId) return;
    setSubmitting(true);
    const durationSeconds = Math.round(parseFloat(duration) * 3600);
    const { data, error } = await supabase.rpc("create_battle_challenge", {
      _opponent_id: opponent.id,
      _challenger_post_id: postId,
      _duration_seconds: durationSeconds,
    });
    setSubmitting(false);
    if (error || !data) {
      console.error("[challenge] rpc failed", error);
      toast.error(battleErrorMessage("challenge", error));
      return;
    }
    toast.success(`Challenge sent to @${opponent.username}`);
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md bg-card border-border max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-gold flex items-center gap-2">
            <Swords size={18} /> Challenge a Royal
          </DialogTitle>
          <DialogDescription className="text-xs">
            {step === 1 ? "Pick your opponent." : "Pick your weapon and the duel terms."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search username…" className="pl-9" />
            </div>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {results.map((u) => (
                <button type="button" key={u.id} onClick={() => { setOpponent(u); setStep(2); }}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 text-left">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-muted shrink-0">
                    {u.profile_photo_url && <img loading="lazy" src={u.profile_photo_url} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <span className="text-sm font-medium truncate">@{u.username}</span>
                </button>
              ))}
              {search && !searching && !results.length && (
                <p className="text-xs text-muted-foreground text-center py-6">No challengeable royals found</p>
              )}
              {searching && (
                <p className="text-xs text-muted-foreground text-center py-6 inline-flex items-center gap-2 justify-center w-full">
                  <Loader2 size={12} className="animate-spin" /> Searching…
                </p>
              )}
            </div>
          </div>
        )}

        {step === 2 && opponent && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-muted shrink-0">
                {opponent.profile_photo_url && <img loading="lazy" src={opponent.profile_photo_url} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Opponent</p>
                <p className="text-sm font-bold truncate">@{opponent.username}</p>
              </div>
              {!presetOpponentId && (
                <Button size="sm" variant="ghost" onClick={() => { setStep(1); setOpponent(null); }}>Change</Button>
              )}
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Pick your post</p>
              {loadingPosts ? (
                <div className="grid grid-cols-3 gap-2 max-h-72 overflow-hidden pr-1">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <RoyalThumbSkeleton key={i} className="rounded-lg" />
                  ))}
                </div>
              ) : myPosts.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No eligible posts — upload one first.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                  {myPosts.map((p) => (
                    <button type="button" key={p.id} onClick={() => { setPostId(p.id); setCategory(p.category); }}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                        postId === p.id ? "border-primary gold-shadow" : "border-transparent opacity-70 hover:opacity-100"
                      }`}>
                      <img
                        loading="lazy"
                        src={p.image_url}
                        alt=""
                        className="w-full h-full object-cover"
                        style={{ filter: cssFor(isValidFilter(p.filter ?? null) ? (p.filter as FilterId) : null) }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Duration</p>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.5">30 minutes</SelectItem>
                    <SelectItem value="1">1 hour</SelectItem>
                    <SelectItem value="1.5">1 hour 30 minutes</SelectItem>
                    <SelectItem value="6">6 hours</SelectItem>
                    <SelectItem value="12">12 hours</SelectItem>
                    <SelectItem value="24">24 hours</SelectItem>
                    <SelectItem value="48">48 hours</SelectItem>
                    <SelectItem value="72">72 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Category</p>
                <Select value={category} onValueChange={(v) => setCategory(v as CrownCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={submit} disabled={!postId || submitting}
              className="w-full bg-gradient-gold text-primary-foreground font-bold gold-shadow">
              {submitting ? <Loader2 className="animate-spin" /> : <><Swords size={16} /> Send Challenge</>}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
