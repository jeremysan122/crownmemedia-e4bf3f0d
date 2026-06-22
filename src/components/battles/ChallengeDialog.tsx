import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Search, Swords, Loader2 } from "lucide-react";
import { CATEGORY_LABEL, CrownCategory } from "@/lib/crown";
import { cssFor, isValidFilter, type FilterId } from "@/lib/filters";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  presetOpponentId?: string | null;
  onCreated?: () => void;
}

interface UserResult { id: string; username: string; profile_photo_url: string | null; }
interface PostThumb { id: string; image_url: string; category: CrownCategory; }

export default function ChallengeDialog({ open, onOpenChange, presetOpponentId, onCreated }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [opponent, setOpponent] = useState<UserResult | null>(null);
  const [myPosts, setMyPosts] = useState<PostThumb[]>([]);
  const [postId, setPostId] = useState<string>("");
  const [duration, setDuration] = useState<string>("24");
  const [category, setCategory] = useState<CrownCategory>("overall");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(1); setSearch(""); setResults([]); setOpponent(null);
      setPostId(""); setDuration("24"); setCategory("overall");
      return;
    }
    if (user) {
      supabase.from("posts").select("id, image_url, category")
        .eq("user_id", user.id).eq("is_removed", false)
        .order("created_at", { ascending: false }).limit(24)
        .then(({ data }) => {
          const posts = (data as PostThumb[]) || [];
          setMyPosts(posts);
          if (posts[0]) { setPostId(posts[0].id); setCategory(posts[0].category); }
        });
    }
    if (presetOpponentId) {
      supabase.from("profiles").select("id, username, profile_photo_url")
        .eq("id", presetOpponentId).maybeSingle()
        .then(({ data }) => { if (data) { setOpponent(data as UserResult); setStep(2); } });
    }
  }, [open, user, presetOpponentId]);

  useEffect(() => {
    if (!search.trim() || step !== 1) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("profiles")
        .select("id, username, profile_photo_url")
        .ilike("username", `%${search.trim()}%`)
        .neq("id", user?.id || "")
        .limit(8);
      setResults((data as UserResult[]) || []);
    }, 250);
    return () => clearTimeout(t);
  }, [search, step, user]);

  const submit = async () => {
    if (!user || !opponent || !postId) return;
    setSubmitting(true);
    const endsAt = new Date(Date.now() + Math.round(parseFloat(duration) * 3600 * 1000)).toISOString();
    const { error } = await supabase.from("battles").insert({
      challenger_id: user.id,
      opponent_id: opponent.id,
      challenger_post_id: postId,
      ends_at: endsAt,
      status: "pending",
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
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
              {search && !results.length && <p className="text-xs text-muted-foreground text-center py-6">No royals found</p>}
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
              {myPosts.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No posts yet — upload one first.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                  {myPosts.map((p) => (
                    <button type="button" key={p.id} onClick={() => { setPostId(p.id); setCategory(p.category); }}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                        postId === p.id ? "border-primary gold-shadow" : "border-transparent opacity-70 hover:opacity-100"
                      }`}>
                      <img loading="lazy" src={p.image_url} alt="" className="w-full h-full object-cover" />
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
