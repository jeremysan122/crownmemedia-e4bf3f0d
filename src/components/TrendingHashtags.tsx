import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, Hash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TrendingTag {
  tag: string;
  post_count: number;
  score: number;
}

export default function TrendingHashtags({ compact = false }: { compact?: boolean }) {
  const [tags, setTags] = useState<TrendingTag[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("trending_hashtags" as any)
        .select("tag, post_count, score")
        .limit(compact ? 6 : 12);
      if (!cancelled) {
        setTags((data as any) || []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [compact]);

  if (loading || tags.length === 0) return null;

  const onPickTag = (tag: string) => {
    navigate(`/feed?tag=${encodeURIComponent(tag)}`);
    // After the URL updates, scroll back to the top of the feed so the user
    // immediately sees the filtered results instead of staying scrolled into
    // the trending board.
    requestAnimationFrame(() => {
      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        window.scrollTo(0, 0);
      }
    });
  };

  return (
    <section className="royal-card p-3" aria-label="Trending hashtags">
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp size={13} className="text-primary" />
        <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
          Trending Tags
        </h3>
        <span className="text-[10px] text-muted-foreground/70 normal-case">last 48h</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <button
            key={t.tag}
            type="button"
            onClick={() => onPickTag(t.tag)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-border bg-card/60 hover:border-primary/40 hover:text-primary transition"
            aria-label={`Filter feed by #${t.tag}`}
          >
            <Hash size={10} />
            {t.tag}
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {t.post_count}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
