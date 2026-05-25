import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Crown, Loader2, Trophy } from "lucide-react";

type Scope = "global" | "country" | "state" | "city";

interface TopPost {
  id: string;
  caption: string | null;
  crown_score: number;
  vote_count: number;
  comment_count: number;
  city: string | null;
  state: string | null;
  country: string | null;
  created_at: string;
  user_id: string;
  profiles?: { username: string } | null;
}

const SCOPES: { key: Scope; label: string }[] = [
  { key: "global", label: "Global" },
  { key: "country", label: "Country" },
  { key: "state", label: "State" },
  { key: "city", label: "City" },
];

export default function CrownRankingsWidget() {
  const [scope, setScope] = useState<Scope>("global");
  const [region, setRegion] = useState<string>("");
  const [posts, setPosts] = useState<TopPost[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setBusy(true);
      let q = supabase
        .from("posts")
        .select("id, caption, crown_score, vote_count, comment_count, city, state, country, created_at, user_id, profiles!posts_user_id_fkey(username)")
        .eq("is_removed", false)
        .order("crown_score", { ascending: false })
        .limit(10);
      if (scope !== "global" && region.trim()) {
        q = q.eq(scope, region.trim());
      }
      const { data } = await q;
      setPosts((data as unknown as TopPost[]) ?? []);
      setBusy(false);
    })();
  }, [scope, region]);

  return (
    <div className="royal-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Trophy size={18} className="text-gold" />
        <h2 className="font-display text-base text-gold">Crown Rankings</h2>
      </div>

      <div className="flex gap-1 p-1 rounded-full bg-muted/40 border border-border/50">
        {SCOPES.map((s) => (
          <button
            key={s.key}
            onClick={() => setScope(s.key)}
            className={`flex-1 h-7 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
              scope === s.key ? "bg-gradient-gold text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {scope !== "global" && (
        <input
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          placeholder={`Filter by ${scope}…`}
          className="w-full bg-muted/40 border border-border/50 rounded-lg px-3 py-2 text-xs"
        />
      )}

      {busy && (
        <div className="py-6 flex items-center justify-center text-muted-foreground">
          <Loader2 size={14} className="animate-spin mr-2" /> Loading…
        </div>
      )}

      {!busy && posts.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-4">No posts found for this scope.</p>
      )}

      <ol className="space-y-1.5">
        {posts.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2 text-xs">
            <span className={`size-6 rounded-full flex items-center justify-center font-bold ${
              i === 0 ? "bg-gradient-gold text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="truncate">
                <span className="font-bold">@{p.profiles?.username ?? p.user_id.slice(0, 6)}</span>
                {p.caption ? <span className="text-muted-foreground"> · {p.caption}</span> : null}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {[p.city, p.state, p.country].filter(Boolean).join(", ") || "—"}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-gold font-bold">
              <Crown size={12} /> {Math.round(Number(p.crown_score))}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
