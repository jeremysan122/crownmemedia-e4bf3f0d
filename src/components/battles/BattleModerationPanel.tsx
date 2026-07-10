// Wave 4 — Host / moderator panel for battle-level moderation.
// Toggles comments locked, slow mode, and per-battle keyword filter list.
// All writes go through the `set_battle_moderation` RPC.

import { useEffect, useMemo, useState } from "react";
import { Loader2, Lock, Unlock, Shield, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import type { LiveBattleRow } from "@/lib/liveBattles";
import {
  SLOW_MODE_OPTIONS, MAX_KEYWORDS, MAX_KEYWORD_LEN,
  sanitizeKeyword, sanitizeKeywordList, moderationErrorMessage,
  readKeywordFilters, setBattleModeration,
} from "@/lib/battleModeration";

interface Props {
  battle: LiveBattleRow;
  onUpdated: (b: LiveBattleRow) => void;
  onClose?: () => void;
}

export default function BattleModerationPanel({ battle, onUpdated, onClose }: Props) {
  const initialKeywords = useMemo(
    () => readKeywordFilters((battle as unknown as { keyword_filters?: unknown }).keyword_filters),
    [battle.id, (battle as unknown as { keyword_filters?: unknown }).keyword_filters],
  );
  const initialSlow = (battle as unknown as { slow_mode_seconds?: number }).slow_mode_seconds ?? 0;
  const initialLocked = !!(battle as unknown as { comments_locked?: boolean }).comments_locked;

  const [locked, setLocked] = useState(initialLocked);
  const [slow, setSlow] = useState<number>(initialSlow);
  const [keywords, setKeywords] = useState<string[]>(initialKeywords);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  // Re-sync when the battle row updates externally (e.g. another moderator).
  useEffect(() => { setLocked(initialLocked); }, [initialLocked]);
  useEffect(() => { setSlow(initialSlow); }, [initialSlow]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setKeywords(initialKeywords); }, [initialKeywords.join("\u0001")]);

  const addKeyword = () => {
    const w = sanitizeKeyword(input);
    if (!w) return;
    const next = sanitizeKeywordList([...keywords, w]);
    setKeywords(next);
    setInput("");
  };
  const removeKeyword = (word: string) => {
    setKeywords((prev) => prev.filter((w) => w.toLowerCase() !== word.toLowerCase()));
  };

  const save = async () => {
    setBusy(true);
    try {
      const row = await setBattleModeration(battle.id, {
        commentsLocked: locked,
        slowModeSeconds: slow,
        keywordFilters: keywords,
      });
      onUpdated(row);
      toast({ title: "Moderation updated" });
    } catch (e) {
      toast({ title: moderationErrorMessage(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-xl border border-border/60 bg-card p-3 space-y-3"
      data-testid="battle-moderation-panel"
      aria-label="Battle moderation controls"
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold flex items-center gap-1.5">
          <Shield className="w-4 h-4 text-primary" /> Chat controls
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label="Close moderation panel"
          >
            Close
          </button>
        )}
      </div>

      {/* Comments locked toggle */}
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border/40 px-3 py-2">
        <div>
          <div className="text-sm font-medium flex items-center gap-1.5">
            {locked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
            {locked ? "Chat is locked" : "Chat is open"}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {locked ? "Only you and moderators can post." : "Anyone in the room can chat."}
          </div>
        </div>
        <Button
          size="sm"
          variant={locked ? "default" : "outline"}
          onClick={() => setLocked((v) => !v)}
          aria-pressed={locked}
          data-testid="battle-mod-lock-toggle"
        >
          {locked ? "Unlock chat" : "Lock chat"}
        </Button>
      </div>

      {/* Slow mode */}
      <div className="rounded-lg border border-border/40 px-3 py-2">
        <div className="text-sm font-medium mb-1">Slow mode</div>
        <div className="text-[11px] text-muted-foreground mb-2">
          Space out chat by requiring a wait between messages.
        </div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Slow mode">
          {SLOW_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.seconds}
              type="button"
              role="radio"
              aria-checked={slow === opt.seconds}
              onClick={() => setSlow(opt.seconds)}
              className={`px-2.5 py-1 rounded-full text-xs border transition
                ${slow === opt.seconds
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
              data-testid={`battle-mod-slow-${opt.seconds}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Keyword filters */}
      <div className="rounded-lg border border-border/40 px-3 py-2">
        <div className="text-sm font-medium mb-1">Blocked words</div>
        <div className="text-[11px] text-muted-foreground mb-2">
          Comments containing any of these get hidden. Up to {MAX_KEYWORDS} words, {MAX_KEYWORD_LEN} chars each.
        </div>
        <div className="flex gap-1.5 mb-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_KEYWORD_LEN))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
            placeholder="Add a word or phrase"
            aria-label="Add blocked word"
            className="h-8"
            data-testid="battle-mod-keyword-input"
            disabled={keywords.length >= MAX_KEYWORDS}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addKeyword}
            disabled={!input.trim() || keywords.length >= MAX_KEYWORDS}
            aria-label="Add word"
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
        {keywords.length === 0 ? (
          <div className="text-[11px] text-muted-foreground italic">No blocked words yet.</div>
        ) : (
          <ul className="flex flex-wrap gap-1.5" aria-label="Blocked words">
            {keywords.map((w) => (
              <li
                key={w}
                className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[11px]"
              >
                <span className="truncate max-w-[10rem]">{w}</span>
                <button
                  type="button"
                  onClick={() => removeKeyword(w)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${w}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={save}
          disabled={busy}
          data-testid="battle-mod-save"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  );
}
