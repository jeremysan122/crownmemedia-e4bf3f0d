// Create Live Battle dialog — pick opponent, category, region, duration.
// Server RPC clamps duration, validates category, checks blocks & feature flag.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, Radio, X } from "lucide-react";
import { toast } from "sonner";
import { createLiveBattle, liveBattleErrorMessage } from "@/lib/liveBattles";
import { useMainCategories } from "@/lib/categories";

interface UserResult {
  id: string;
  username: string;
  profile_photo_url: string | null;
}

const DURATION_OPTIONS = [
  { value: 60, label: "1 min" },
  { value: 180, label: "3 min" },
  { value: 300, label: "5 min" },
  { value: 600, label: "10 min" },
];

export default function CreateLiveBattleDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const { mains } = useMainCategories();

  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<UserResult[]>([]);
  const [opponent, setOpponent] = useState<UserResult | null>(null);
  const [category, setCategory] = useState<string>("");
  const [region, setRegion] = useState("");
  const [duration, setDuration] = useState(300);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const retryRef = useRef<HTMLButtonElement | null>(null);

  // Move focus to the retry button after a failed acceptance RPC so
  // screen-reader users are placed on the actionable recovery control.
  useEffect(() => {
    if (submitError && !submitting) {
      // Wait a tick for the button to render before focusing.
      const t = setTimeout(() => retryRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [submitError, submitting]);

  useEffect(() => {
    if (!open) {
      setSearch(""); setResults([]); setOpponent(null); setSearchError(null);
      setCategory(""); setRegion(""); setDuration(300);
      setSubmitting(false); setSubmitError(null);
    }
  }, [open]);

  useEffect(() => {
    if (opponent || !search.trim()) { setResults([]); setSearchError(null); return; }
    setSearching(true);
    setSearchError(null);
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase.from("profiles")
          .select("id, username, profile_photo_url, is_banned, is_suspended")
          .ilike("username", `%${search.trim()}%`)
          .neq("id", user?.id || "")
          .limit(10);
        if (error) throw error;
        const filtered = ((data as any[]) || [])
          .filter((p) => !p.is_banned && !p.is_suspended)
          .slice(0, 8)
          .map((p): UserResult => ({
            id: p.id, username: p.username, profile_photo_url: p.profile_photo_url,
          }));
        setResults(filtered);
      } catch {
        setResults([]);
        setSearchError("Couldn't search right now. Check your connection and try again.");
      } finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [search, opponent, user?.id]);

  const canSubmit = useMemo(
    () => !!opponent && !submitting,
    [opponent, submitting],
  );

  const handleCreate = async () => {
    if (!opponent) {
      setSubmitError("Pick an opponent first.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const row = await createLiveBattle(
        opponent.id, duration,
        category || null,
        region.trim() || null,
      );
      toast.success("Live battle created — jumping in…");
      onOpenChange(false);
      nav(`/live/${row.id}`);
    } catch (e) {
      const msg = liveBattleErrorMessage(e, "Couldn't create battle. Try again.");
      setSubmitError(msg);
      toast.error(msg);
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="create-live-battle-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="text-destructive" size={18} /> New Live Battle
          </DialogTitle>
          <DialogDescription>
            Pick your opponent, category, and battle length.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Opponent */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Opponent
            </label>
            {opponent ? (
              <div className="mt-1 flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 p-2" data-testid="selected-opponent">
                <div className="flex items-center gap-2">
                  {opponent.profile_photo_url ? (
                    <img src={opponent.profile_photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-muted" />
                  )}
                  <span className="text-sm font-semibold">@{opponent.username}</span>
                </div>
                <button onClick={() => setOpponent(null)} className="text-muted-foreground hover:text-foreground">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className="relative mt-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by username"
                    className="pl-8"
                    data-testid="opponent-search-input"
                  />
                </div>
                {searching && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground" data-testid="opponent-search-loading" role="status" aria-live="polite">
                    <Loader2 className="animate-spin" size={12} /> Searching…
                  </div>
                )}
                {!searching && searchError && (
                  <p className="mt-2 text-xs text-destructive" role="alert" data-testid="opponent-search-error">
                    {searchError}
                  </p>
                )}
                {!searching && !searchError && results.length > 0 && (
                  <ul className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40" data-testid="opponent-search-results">
                    {results.map((r) => (
                      <li key={r.id}>
                        <button
                          onClick={() => { setOpponent(r); setSearch(""); }}
                          className="w-full flex items-center gap-2 p-2 hover:bg-muted/50 text-left"
                          data-testid="opponent-search-result"
                          data-username={r.username}
                        >
                          {r.profile_photo_url ? (
                            <img src={r.profile_photo_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-muted" />
                          )}
                          <span className="text-sm">@{r.username}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!searching && !searchError && search.trim() && results.length === 0 && (
                  <p className="mt-2 text-xs text-muted-foreground" data-testid="opponent-search-empty">
                    No royals found with that username.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Category (optional)
            </label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choose category" />
              </SelectTrigger>
              <SelectContent>
                {mains.map((m) => (
                  <SelectItem key={m.slug} value={m.slug}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Region */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Region (optional)
            </label>
            <Input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="e.g. Los Angeles, CA"
              maxLength={80}
              className="mt-1"
            />
          </div>

          {/* Duration */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Length
            </label>
            <div className="mt-1 grid grid-cols-4 gap-2">
              {DURATION_OPTIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDuration(d.value)}
                  className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                    duration === d.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/60 hover:border-primary/50"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {submitError && (
            <div
              className="rounded-md border border-destructive/40 bg-destructive/10 p-3 space-y-2"
              role="alert"
              data-testid="create-battle-error"
            >
              <p className="text-xs text-destructive font-medium">{submitError}</p>
              <Button
                ref={retryRef}
                type="button"
                size="sm"
                variant="outline"
                className="w-full h-8"
                onClick={handleCreate}
                disabled={!canSubmit}
                data-testid="create-battle-retry"
                aria-label="Retry creating live battle"
              >
                {submitting ? (
                  <><Loader2 className="animate-spin mr-2" size={12} /> Retrying…</>
                ) : (
                  <>Try again</>
                )}
              </Button>
            </div>
          )}
          <Button
            onClick={handleCreate}
            disabled={!canSubmit}
            className="w-full"
            size="lg"
            aria-busy={submitting}
            data-testid="create-battle-submit"
          >
            {submitting ? (
              <><Loader2 className="animate-spin mr-2" size={16} /> Creating…</>
            ) : (
              <>Start Battle</>
            )}
          </Button>

          <p className="text-[11px] text-muted-foreground text-center">
            Your opponent will be notified when the room opens.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
