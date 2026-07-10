// Schedule a live battle for later. Host picks opponent, category, region,
// duration, and a future start time. Server enforces safety; the opponent
// gets it as a pending scheduled invite; LiveKit tokens are blocked until
// the battle transitions out of 'scheduled'.

import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, CalendarClock, X, Copy, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useMainCategories } from "@/lib/categories";
import { scheduleLiveBattle, scheduleErrorMessage, LiveBattleRow } from "@/lib/liveBattles";
import { buildIcsEvent, downloadIcs } from "@/lib/ics";

interface UserResult { id: string; username: string; profile_photo_url: string | null }

const DURATION_OPTIONS = [
  { value: 180, label: "3 min" },
  { value: 300, label: "5 min" },
  { value: 600, label: "10 min" },
  { value: 900, label: "15 min" },
];

/** Format Date -> value suitable for <input type="datetime-local"> in local TZ. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ScheduleBattleSheet({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const { mains } = useMainCategories();

  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UserResult[]>([]);
  const [opponent, setOpponent] = useState<UserResult | null>(null);
  const [category, setCategory] = useState<string>("");
  const [region, setRegion] = useState("");
  const [duration, setDuration] = useState(300);
  const [startLocal, setStartLocal] = useState(() => toLocalInput(new Date(Date.now() + 30 * 60_000)));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<LiveBattleRow | null>(null);

  useEffect(() => {
    if (!open) {
      setSearch(""); setResults([]); setOpponent(null);
      setCategory(""); setRegion(""); setDuration(300);
      setStartLocal(toLocalInput(new Date(Date.now() + 30 * 60_000)));
      setSubmitting(false); setError(null); setCreated(null);
    }
  }, [open]);

  useEffect(() => {
    if (opponent || !search.trim()) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await supabase.from("profiles")
          .select("id, username, profile_photo_url, is_banned, is_suspended")
          .ilike("username", `%${search.trim()}%`)
          .neq("id", user?.id || "")
          .limit(8);
        setResults(((data as any[]) || [])
          .filter((p) => !p.is_banned && !p.is_suspended)
          .map((p): UserResult => ({ id: p.id, username: p.username, profile_photo_url: p.profile_photo_url })));
      } finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [search, opponent, user?.id]);

  const startDate = useMemo(() => new Date(startLocal), [startLocal]);
  const minLocal = useMemo(() => toLocalInput(new Date(Date.now() + 5 * 60_000)), []);

  const canSubmit = !!opponent
    && !submitting
    && !isNaN(startDate.getTime())
    && startDate.getTime() > Date.now() + 4.5 * 60_000;

  const handleSchedule = async () => {
    if (!opponent) { setError("Pick an opponent first."); return; }
    setSubmitting(true); setError(null);
    try {
      const row = await scheduleLiveBattle(
        opponent.id, startDate, duration,
        category || null, region.trim() || null,
      );
      setCreated(row);
      toast.success("Battle scheduled — invite sent");
    } catch (e) {
      const msg = scheduleErrorMessage(e);
      setError(msg);
      toast.error(msg);
    } finally { setSubmitting(false); }
  };

  const inviteLink = created ? `${window.location.origin}/live/${created.id}` : "";

  const handleCopy = async () => {
    if (!inviteLink) return;
    try { await navigator.clipboard.writeText(inviteLink); toast.success("Invite link copied"); }
    catch { toast.error("Couldn't copy — please copy the link manually."); }
  };

  const handleAddToCalendar = () => {
    if (!created || !created.scheduled_start_at) return;
    const ics = buildIcsEvent({
      uid: `crownme-battle-${created.id}@crownmemedia.com`,
      title: `Live Battle vs @${opponent?.username ?? "royal"}`,
      description: "Your scheduled CrownMe live battle. Tap the link to join when it starts.",
      url: inviteLink,
      start: new Date(created.scheduled_start_at),
      durationMinutes: Math.max(5, Math.round(created.duration_seconds / 60)),
    });
    downloadIcs(`crownme-battle-${created.id}.ics`, ics);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="schedule-battle-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="text-primary" size={18} /> Schedule a Battle
          </DialogTitle>
          <DialogDescription>
            Pick a future time. Your opponent gets a scheduled invite.
          </DialogDescription>
        </DialogHeader>

        {!created ? (
          <div className="space-y-4">
            {/* Opponent */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Opponent</Label>
              {opponent ? (
                <div className="mt-1 flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 p-2">
                  <div className="flex items-center gap-2">
                    {opponent.profile_photo_url
                      ? <img src={opponent.profile_photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                      : <div className="w-8 h-8 rounded-full bg-muted" />}
                    <span className="text-sm font-semibold">@{opponent.username}</span>
                  </div>
                  <button onClick={() => setOpponent(null)} aria-label="Change opponent" className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
                </div>
              ) : (
                <>
                  <div className="relative mt-1">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by username" className="pl-8" />
                  </div>
                  {searching && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
                      <Loader2 className="animate-spin" size={12} /> Searching…
                    </div>
                  )}
                  {!searching && results.length > 0 && (
                    <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40">
                      {results.map((r) => (
                        <li key={r.id}>
                          <button onClick={() => { setOpponent(r); setSearch(""); }} className="w-full flex items-center gap-2 p-2 hover:bg-muted/50 text-left">
                            {r.profile_photo_url
                              ? <img src={r.profile_photo_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                              : <div className="w-7 h-7 rounded-full bg-muted" />}
                            <span className="text-sm">@{r.username}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            {/* Start time */}
            <div>
              <Label htmlFor="schedule-start" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Start time
              </Label>
              <Input
                id="schedule-start"
                type="datetime-local"
                min={minLocal}
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                className="mt-1"
                data-testid="schedule-start-input"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                At least 5 minutes from now, within the next 30 days.
              </p>
            </div>

            {/* Category */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category (optional)</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choose category" /></SelectTrigger>
                <SelectContent>
                  {mains.map((m) => (<SelectItem key={m.slug} value={m.slug}>{m.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            {/* Region */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Region (optional)</Label>
              <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. Los Angeles, CA" maxLength={80} className="mt-1" />
            </div>

            {/* Duration */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Length</Label>
              <div className="mt-1 grid grid-cols-4 gap-2">
                {DURATION_OPTIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDuration(d.value)}
                    className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                      duration === d.value ? "border-primary bg-primary/10 text-primary" : "border-border/60 hover:border-primary/50"
                    }`}
                  >{d.label}</button>
                ))}
              </div>
            </div>

            {error && (
              <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive font-medium">
                {error}
              </div>
            )}

            <Button
              onClick={handleSchedule}
              disabled={!canSubmit}
              className="w-full"
              size="lg"
              aria-busy={submitting}
              data-testid="schedule-battle-submit"
            >
              {submitting ? <><Loader2 className="animate-spin mr-2" size={16} /> Scheduling…</> : <>Schedule Battle</>}
            </Button>
          </div>
        ) : (
          <div className="space-y-4" data-testid="schedule-battle-success">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <div className="font-semibold">Scheduled for</div>
              <div className="text-muted-foreground">
                {created.scheduled_start_at ? new Date(created.scheduled_start_at).toLocaleString() : ""}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleCopy}>
                <Copy size={14} className="mr-1.5" /> Copy invite
              </Button>
              <Button variant="outline" className="flex-1" onClick={handleAddToCalendar}>
                <CalendarPlus size={14} className="mr-1.5" /> Add to calendar
              </Button>
            </div>
            <Button className="w-full" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
