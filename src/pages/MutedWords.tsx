// Muted Words — user-managed list of words/phrases to hide from feed & comments.
// Server-side filtering is TODO; this page persists the list and exposes a
// helper hook can be added later for readers to consult.

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

type Row = { id: string; word: string };

export default function MutedWords() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("muted_words" as any)
      .select("id, word")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    setRows((data as any[])?.map((r) => ({ id: r.id, word: r.word })) ?? []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const add = async () => {
    const word = input.trim().toLowerCase();
    if (!word || !user?.id) return;
    if (word.length > 60) { toast.error("Keep it under 60 characters."); return; }
    setBusy(true);
    const { error } = await supabase.from("muted_words" as any).insert({ user_id: user.id, word });
    setBusy(false);
    if (error) {
      if ((error as any).code === "23505") toast("Already muted");
      else toast.error(error.message);
      return;
    }
    setInput("");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("muted_words" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRows((r) => r.filter((x) => x.id !== id));
  };

  return (
    <AppShell title="MUTED WORDS">
      <div className="px-4 py-4 space-y-4">
        <h1 className="font-display text-2xl text-gold">Muted words</h1>
        <p className="text-[12px] text-muted-foreground">
          Posts and comments containing these words are hidden from your feed.
          Case-insensitive, exact word match.
        </p>

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="Add a word or phrase…"
            className="bg-input h-10"
            maxLength={60}
          />
          <Button onClick={add} disabled={busy || !input.trim()} className="h-10">
            <Plus size={16} /> Add
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {rows.length === 0 && (
            <span className="text-[12px] text-muted-foreground">No muted words yet.</span>
          )}
          {rows.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full bg-muted/40 border border-border text-xs">
              {r.word}
              <button
                type="button"
                onClick={() => remove(r.id)}
                aria-label={`Remove ${r.word}`}
                className="size-5 rounded-full hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
