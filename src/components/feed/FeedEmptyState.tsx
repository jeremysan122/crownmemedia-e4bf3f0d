// Context-aware empty state for the Feed. Picks copy + CTAs based on which
// combination of filters produced zero posts so the user always has a way
// forward (discover creators, clear filters, jump to Global, or post).
import { Link } from "react-router-dom";
import { Compass, Globe2, Plus, X as XIcon, UserPlus } from "lucide-react";
import { CATEGORY_LABEL, CrownCategory } from "@/lib/crown";

export interface FeedEmptyContext {
  tab: "nearby" | "city" | "state" | "global" | "following";
  catFilter: "all" | CrownCategory;
  tagFilter: string;
  city?: string | null;
  state?: string | null;
  onClearFilters?: () => void;
  onGoGlobal?: () => void;
  hasAnyFilter: boolean;
}

export default function FeedEmptyState(props: FeedEmptyContext) {
  const { tab, catFilter, tagFilter, city, state, onClearFilters, onGoGlobal, hasAnyFilter } = props;

  let title = "The throne awaits";
  let body = "No posts yet in this realm. Be the first to claim it.";

  if (tab === "following") {
    title = "Your court is empty";
    body = "You're not following anyone yet. Discover creators to start building your feed.";
  } else if (tagFilter) {
    title = `No posts for #${tagFilter}`;
    body = "Try clearing the hashtag filter or be the first to crown a moment with it.";
  } else if (catFilter !== "all") {
    title = `No posts in ${CATEGORY_LABEL[catFilter as CrownCategory]} yet`;
    body = "Be the first to claim this category or browse the Global feed.";
  } else if (tab === "city" || tab === "nearby") {
    title = `Quiet in ${city || "your city"}`;
    body = "No posts yet nearby. Be the first to claim your city.";
  } else if (tab === "state") {
    title = `Quiet in ${state || "your state"}`;
    body = "No posts yet in your state. Be the first to claim it.";
  }

  return (
    <div
      className="royal-card p-8 sm:p-10 text-center mt-6 mx-3 lg:mx-0"
      role="status"
      aria-live="polite"
    >
      <p className="font-display text-gold text-lg mb-2">{title}</p>
      <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">{body}</p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {tab === "following" ? (
          <>
            <Link
              to="/leaderboard"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-gradient-gold text-primary-foreground font-bold text-sm gold-shadow"
            >
              <UserPlus size={16} /> Discover creators
            </Link>
            {onGoGlobal && (
              <button
                onClick={onGoGlobal}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-card/80 text-foreground border border-border font-bold text-sm hover:border-primary/40"
              >
                <Globe2 size={16} /> Go to Global
              </button>
            )}
          </>
        ) : (
          <>
            <Link
              to="/upload"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-gradient-gold text-primary-foreground font-bold text-sm gold-shadow"
            >
              <Plus size={16} /> Crown a Post
            </Link>
            {hasAnyFilter && onClearFilters && (
              <button
                onClick={onClearFilters}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-card/80 text-foreground border border-border font-bold text-sm hover:border-primary/40"
              >
                <XIcon size={16} /> Clear filters
              </button>
            )}
            {tab !== "global" && onGoGlobal && (
              <button
                onClick={onGoGlobal}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-card/80 text-foreground border border-border font-bold text-sm hover:border-primary/40"
              >
                <Globe2 size={16} /> View Global feed
              </button>
            )}
            <Link
              to="/crown-map"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-card/80 text-foreground border border-border font-bold text-sm hover:border-primary/40"
            >
              <Compass size={16} /> Explore the map
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
