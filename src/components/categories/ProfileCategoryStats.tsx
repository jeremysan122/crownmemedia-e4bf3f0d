// Compact category-stats card shown on user profile.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, TrendingUp } from "lucide-react";
import { fetchUserCategoryStats, type CategoryStat } from "@/lib/categories";

export default function ProfileCategoryStats({ userId }: { userId: string }) {
  const [stats, setStats] = useState<CategoryStat[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!userId) return;
    fetchUserCategoryStats(userId).then((s) => { setStats(s); setLoading(false); });
  }, [userId]);

  if (loading) return null;
  if (stats.length === 0) {
    return (
      <section className="royal-card p-4 text-center">
        <p className="text-xs text-muted-foreground">No category activity yet. Compete in a hub to start earning category crowns.</p>
      </section>
    );
  }

  return (
    <section className="royal-card p-4">
      <header className="flex items-center justify-between mb-3">
        <h3 className="font-display text-sm tracking-widest text-gold flex items-center gap-1.5">
          <TrendingUp size={13} /> Category Reign
        </h3>
      </header>
      <div className="space-y-1.5">
        {stats.slice(0, 6).map((s) => (
          <Link key={s.main_slug} to={`/c/${s.main_slug}`}
            className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/30 transition">
            <span className="text-sm font-semibold truncate">{s.main_label}</span>
            <div className="flex items-center gap-2 shrink-0 text-[11px] text-muted-foreground">
              {s.crowns_won > 0 && (
                <span className="inline-flex items-center gap-0.5 text-gold font-bold">
                  <Crown size={10} fill="currentColor" />{s.crowns_won}
                </span>
              )}
              <span>{s.post_count}p</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
