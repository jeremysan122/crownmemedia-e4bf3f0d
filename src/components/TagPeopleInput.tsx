import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Search, Loader2 } from "lucide-react";

export interface TaggedProfile {
  id: string;
  username: string;
  profile_photo_url: string | null;
}

interface Props {
  value: TaggedProfile[];
  onChange: (v: TaggedProfile[]) => void;
  excludeUserId?: string;
  max?: number;
  label?: string;
}

/**
 * Username autocomplete used to tag people in a post. Persists as a small
 * array of profile previews so the caller can immediately render chips and
 * also know which ids to write to `posts.tagged_user_ids`.
 */
export default function TagPeopleInput({
  value, onChange, excludeUserId, max = 10, label = "Tag people",
}: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<TaggedProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, profile_photo_url")
        .ilike("username", `${term}%`)
        .limit(8);
      const list = (data ?? []).filter(
        (p) =>
          p.id !== excludeUserId &&
          !value.some((v) => v.id === p.id),
      ) as TaggedProfile[];
      setResults(list);
      setLoading(false);
    }, 220);
    return () => clearTimeout(t);
  }, [q, excludeUserId, value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const add = (p: TaggedProfile) => {
    if (value.length >= max) return;
    onChange([...value, p]);
    setQ("");
    setResults([]);
  };
  const remove = (id: string) => onChange(value.filter((v) => v.id !== id));

  const canAddMore = value.length < max;

  return (
    <div className="space-y-1.5" ref={boxRef}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
          {label}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">{value.length}/{max}</span>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full bg-primary/15 text-foreground text-xs border border-primary/30"
            >
              {p.profile_photo_url ? (
                <img loading="lazy" src={p.profile_photo_url} alt="" className="size-4 rounded-full object-cover" />
              ) : (
                <span className="size-4 rounded-full bg-muted" />
              )}
              <span>@{p.username}</span>
              <button type="button" onClick={() => remove(p.id)} aria-label={`Remove ${p.username}`}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {canAddMore && (
        <div className="relative">
          <div className="flex items-center gap-2 px-2 h-9 rounded-lg border border-border bg-input">
            <Search size={14} className="text-muted-foreground" />
            <input
              value={q}
              onFocus={() => setOpen(true)}
              onChange={(e) => { setQ(e.target.value); setOpen(true); }}
              placeholder="Search by username"
              className="flex-1 bg-transparent text-sm outline-none"
            />
            {loading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
          </div>
          {open && results.length > 0 && (
            <ul className="absolute z-30 left-0 right-0 mt-1 rounded-lg border border-border bg-popover shadow-lg max-h-56 overflow-y-auto">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => add(p)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted text-left text-sm"
                  >
                    {p.profile_photo_url ? (
                      <img loading="lazy" src={p.profile_photo_url} alt="" className="size-6 rounded-full object-cover" />
                    ) : (
                      <span className="size-6 rounded-full bg-muted" />
                    )}
                    <span>@{p.username}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
