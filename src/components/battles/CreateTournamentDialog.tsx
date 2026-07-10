// Wave 5 — Create a tournament from a title, size, and list of participants.
// Participants are entered as @usernames (comma or newline separated); the
// dialog resolves them via the `profiles` table before calling the RPC.

import { useState } from "react";
import { Loader2, Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  createTournament, tournamentErrorMessage, type TournamentSize,
} from "@/lib/tournaments";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

const SIZES: TournamentSize[] = [4, 8, 16];

function parseHandles(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);
}

export default function CreateTournamentDialog({ open, onOpenChange, onCreated }: Props) {
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [size, setSize] = useState<TournamentSize>(8);
  const [handles, setHandles] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => { setTitle(""); setSize(8); setHandles(""); };

  const submit = async () => {
    const raw = parseHandles(handles);
    if (title.trim().length < 3) {
      toast({ title: "Give it a real title (3+ characters).", variant: "destructive" });
      return;
    }
    if (raw.length !== size) {
      toast({
        title: `You need exactly ${size} participants.`,
        description: `Got ${raw.length}.`,
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      // Resolve usernames → ids.
      const { data: profs, error } = await supabase
        .from("profiles")
        .select("id,username")
        .in("username", raw);
      if (error) throw error;
      const byName: Record<string, string> = {};
      (profs ?? []).forEach((p) => { if (p.username) byName[p.username.toLowerCase()] = p.id; });
      const ids: string[] = [];
      const missing: string[] = [];
      for (const h of raw) {
        if (byName[h]) ids.push(byName[h]);
        else missing.push(h);
      }
      if (missing.length) {
        toast({
          title: "Couldn't find these battlers",
          description: missing.map((m) => `@${m}`).join(", "),
          variant: "destructive",
        });
        setBusy(false);
        return;
      }

      const t = await createTournament({
        title: title.trim(), size, participants: ids,
      });
      toast({ title: "Tournament created", description: "Round 1 is ready to go." });
      reset();
      onOpenChange(false);
      onCreated?.();
      nav(`/tournaments/${t.id}`);
    } catch (e) {
      toast({ title: tournamentErrorMessage(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" /> New tournament
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 80))}
              placeholder="Friday night crown quest"
              className="mt-1"
              data-testid="tournament-title-input"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bracket size</label>
            <div className="mt-1 flex gap-1.5" role="radiogroup" aria-label="Bracket size">
              {SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={size === s}
                  onClick={() => setSize(s)}
                  className={`flex-1 py-2 rounded-md border text-sm font-semibold transition ${
                    size === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`tournament-size-${s}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Participants ({size} @usernames)
            </label>
            <Textarea
              value={handles}
              onChange={(e) => setHandles(e.target.value)}
              placeholder="@alice, @bob, @carol, @dan…"
              rows={4}
              className="mt-1 font-mono text-xs"
              data-testid="tournament-handles-input"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Comma or newline separated. Order = seeding (1v2, 3v4, …).
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy} data-testid="tournament-submit">
            {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Create bracket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
