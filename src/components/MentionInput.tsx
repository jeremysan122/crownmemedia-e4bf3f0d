import { forwardRef, KeyboardEvent, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MentionUser {
  id: string;
  username: string;
  profile_photo_url: string | null;
}

export interface PriorityMentionUser extends MentionUser {
  /** Why this user is prioritized — shown as a small chip in suggestions. */
  reason?: "author" | "participant" | "local";
}

export interface MentionInputHandle {
  focus: () => void;
  insertMention: (username: string) => void;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  /** Resolved mentions (by username) found in the current text. */
  onMentionsChange?: (mentions: MentionUser[]) => void;
  /** Users to surface first (post author, recent commenters, same-city/state). */
  priorityUsers?: PriorityMentionUser[];
  placeholder?: string;
  maxLength?: number;
  className?: string;
}

const MENTION_RE = /(^|\s)@([a-zA-Z0-9_.]{1,30})$/;
const ALL_MENTIONS_RE = /@([a-zA-Z0-9_.]{1,30})/g;

const MentionInput = forwardRef<MentionInputHandle, Props>(function MentionInput(
  { value, onChange, onSubmit, onMentionsChange, priorityUsers = [], placeholder, maxLength = 500, className = "" },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<PriorityMentionUser[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const cacheRef = useRef<Map<string, MentionUser>>(new Map()); // username -> profile

  // Keep priority users in cache so resolveMentions doesn't re-fetch them
  useEffect(() => {
    priorityUsers.forEach((u) => cacheRef.current.set(u.username.toLowerCase(), u));
  }, [priorityUsers]);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    insertMention: (username: string) => insertAt(username),
  }));

  // Detect "@token" right before the caret.
  const detectQuery = useCallback((text: string, caret: number): string | null => {
    const left = text.slice(0, caret);
    const m = left.match(MENTION_RE);
    return m ? m[2] : null;
  }, []);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const q = detectQuery(value, caret);
    if (q == null) {
      setOpen(false);
      setSuggestions([]);
      return;
    }
    const ql = q.toLowerCase();

    // 1) Synchronous priority matches — show instantly.
    const priorityMatches = priorityUsers
      .filter((u) => u.username.toLowerCase().startsWith(ql))
      .slice(0, 6);
    setSuggestions(priorityMatches);
    setActiveIdx(0);
    setOpen(priorityMatches.length > 0);

    // 2) Async global match — merge under the priority list, deduped.
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, profile_photo_url")
        .ilike("username", `${q}%`)
        .limit(8);
      if (cancelled) return;
      const seen = new Set(priorityMatches.map((u) => u.id));
      const extras = (data ?? [])
        .filter((u: any) => !seen.has(u.id))
        .map((u: any) => u as PriorityMentionUser);
      const merged = [...priorityMatches, ...extras].slice(0, 8);
      merged.forEach((u) => cacheRef.current.set(u.username.toLowerCase(), u));
      setSuggestions(merged);
      setOpen(merged.length > 0);
    }, 120);
    return () => { cancelled = true; clearTimeout(t); };
  }, [value, detectQuery, priorityUsers]);

  // Resolve all @usernames currently in the text → MentionUser[]
  const resolveMentionsRef = useRef<(text: string) => Promise<void>>();
  resolveMentionsRef.current = async (text: string) => {
    if (!onMentionsChange) return;
    const usernames = Array.from(new Set(
      [...text.matchAll(ALL_MENTIONS_RE)].map((m) => m[1].toLowerCase())
    ));
    if (usernames.length === 0) { onMentionsChange([]); return; }
    const cached: MentionUser[] = [];
    const missing: string[] = [];
    for (const u of usernames) {
      const hit = cacheRef.current.get(u);
      if (hit) cached.push(hit); else missing.push(u);
    }
    if (missing.length) {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, profile_photo_url")
        .in("username", missing);
      (data ?? []).forEach((u: any) => {
        cacheRef.current.set(u.username.toLowerCase(), u);
        cached.push(u);
      });
    }
    onMentionsChange(cached);
  };
  useEffect(() => { resolveMentionsRef.current?.(value); }, [value]);

  const insertAt = (username: string) => {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? value.length;
    const left = value.slice(0, caret);
    const right = value.slice(caret);
    const replaced = left.replace(MENTION_RE, (_m, sp) => `${sp}@${username} `);
    const next = (replaced + right).slice(0, maxLength);
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      const pos = replaced.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (open && suggestions.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => (i + 1) % suggestions.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertAt(suggestions[activeIdx].username);
        return;
      }
      if (e.key === "Escape") { setOpen(false); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        className={`flex h-10 w-full rounded-md border border-input bg-input px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      />
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 z-50 rounded-xl border border-border bg-popover shadow-xl overflow-hidden">
          {suggestions.map((u, i) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertAt(u.username); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition ${i === activeIdx ? "bg-muted" : "hover:bg-muted/60"}`}
            >
              <div className="size-7 rounded-full bg-muted overflow-hidden shrink-0">
                {u.profile_photo_url && <img loading="lazy" src={u.profile_photo_url} alt="" className="w-full h-full object-cover" />}
              </div>
              <span className="text-sm font-medium flex-1 truncate">@{u.username}</span>
              {u.reason === "author" && (
                <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">Author</span>
              )}
              {u.reason === "participant" && (
                <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">In thread</span>
              )}
              {u.reason === "local" && (
                <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">Nearby</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default MentionInput;

/** Render comment body with @username chunks highlighted. */
export function renderMentions(body: string) {
  const out: (string | { mention: string })[] = [];
  let last = 0;
  for (const m of body.matchAll(ALL_MENTIONS_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(body.slice(last, start));
    out.push({ mention: m[1] });
    last = start + m[0].length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}
