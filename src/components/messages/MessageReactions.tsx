import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SmilePlus, Undo2 } from "lucide-react";

const QUICK = ["👑", "❤️", "🔥", "💎", "😂", "👏", "😮", "😢"];
const UNDO_MS = 4000;

type Reaction = { id: string; user_id: string; emoji: string };

export default function MessageReactions({
  messageId,
  reactions,
  onChange,
}: {
  messageId: string;
  reactions: Reaction[];
  onChange: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  // Undo state for the most recent reaction this user added on this message
  const [pendingUndo, setPendingUndo] = useState<{ emoji: string; expiresAt: number } | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const lastInsertedRef = useRef<{ emoji: string } | null>(null);

  // Group by emoji
  const grouped = reactions.reduce<Record<string, Reaction[]>>((acc, r) => {
    (acc[r.emoji] ||= []).push(r);
    return acc;
  }, {});

  const clearUndoTimer = () => {
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };
  useEffect(() => () => clearUndoTimer(), []);

  const addReaction = async (emoji: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("message_reactions")
      .insert({ message_id: messageId, user_id: user.id, emoji });
    if (error) return;
    lastInsertedRef.current = { emoji };
    setPendingUndo({ emoji, expiresAt: Date.now() + UNDO_MS });
    clearUndoTimer();
    undoTimerRef.current = window.setTimeout(() => {
      setPendingUndo(null);
      lastInsertedRef.current = null;
    }, UNDO_MS);
    onChange();
  };

  const removeReaction = async (id: string) => {
    await supabase.from("message_reactions").delete().eq("id", id);
    onChange();
  };

  const toggle = async (emoji: string) => {
    if (!user) return;
    const mine = reactions.find((r) => r.emoji === emoji && r.user_id === user.id);
    if (mine) {
      await removeReaction(mine.id);
      // Toggling off your own reaction also clears any pending undo for it
      if (pendingUndo?.emoji === emoji) {
        clearUndoTimer();
        setPendingUndo(null);
      }
    } else {
      await addReaction(emoji);
    }
    setOpen(false);
  };

  const undoLast = async () => {
    if (!user || !pendingUndo) return;
    const mine = reactions.find((r) => r.emoji === pendingUndo.emoji && r.user_id === user.id);
    clearUndoTimer();
    setPendingUndo(null);
    lastInsertedRef.current = null;
    if (mine) await removeReaction(mine.id);
  };

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {Object.entries(grouped).map(([emoji, list]) => {
        const mine = list.some((r) => r.user_id === user?.id);
        return (
          <button
            key={emoji}
            onClick={() => toggle(emoji)}
            className={`text-xs px-1.5 h-5 rounded-full border tabular-nums flex items-center gap-1 transition-transform hover:scale-105 ${
              mine ? "bg-primary/20 border-primary text-primary" : "bg-background/50 border-border"
            }`}
          >
            <span>{emoji}</span>
            <span>{list.length}</span>
          </button>
        );
      })}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="text-xs h-5 w-5 rounded-full border border-border bg-background/50 flex items-center justify-center opacity-60 hover:opacity-100">
            <SmilePlus size={11} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="flex gap-1">
            {QUICK.map((e) => (
              <button
                key={e}
                onClick={() => toggle(e)}
                className="text-lg hover:scale-125 transition-transform"
                aria-label={`React ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {pendingUndo && (
        <button
          onClick={undoLast}
          className="text-[10px] h-5 px-2 rounded-full border border-border bg-muted/70 text-muted-foreground hover:text-foreground flex items-center gap-1 animate-fade-in"
          aria-label={`Undo ${pendingUndo.emoji} reaction`}
        >
          <Undo2 size={10} />
          Undo {pendingUndo.emoji}
        </button>
      )}
    </div>
  );
}
