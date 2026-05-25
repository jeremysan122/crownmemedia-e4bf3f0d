/**
 * Deterministic fixtures for Crown Score scenarios.
 *
 * These builders intentionally mirror the columns / triggers in the database
 * so a test author can describe a scenario in plain English and get a stable
 * post + engagement bag + boost state, plus the exact score
 * `public.recalc_post_score()` would produce.
 *
 * Why this exists:
 *   - New score scenarios should be a one-liner: `scoreScenario({ crowns: 10, comments: 50 })`
 *   - All ids/timestamps are derived from a seed so snapshots & equality checks
 *     are reproducible across runs.
 *   - The score oracle (`recalcOracle`) lives next to the fixtures so any
 *     formula change forces a deliberate update here, not a silent drift.
 */
import type { CrownCategory } from "@/lib/crown";

// ─── Deterministic id / time helpers ────────────────────────────────────────

const FIXED_EPOCH = Date.UTC(2026, 0, 1, 12, 0, 0); // 2026-01-01T12:00:00Z

/** FNV-1a 32-bit hash → stable uuid-ish string from a seed string. */
function seededId(seed: string, kind: string): string {
  let h = 0x811c9dc5;
  const input = `${kind}:${seed}`;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const hex = (h >>> 0).toString(16).padStart(8, "0");
  // RFC4122-shaped string; not a real UUID but stable & unique per (seed,kind).
  return `${hex}-0000-4000-8000-${kind.padEnd(12, "0").slice(0, 12)}`;
}

function seededTime(seed: string, offsetMs = 0): string {
  // Stable per seed but ordered by offset.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return new Date(FIXED_EPOCH + (h % 86_400_000) + offsetMs).toISOString();
}

// ─── Vote / engagement bag ──────────────────────────────────────────────────

export interface VoteBag {
  crown: number;
  fire: number;
  diamond: number;
}

export interface EngagementBag {
  votes: VoteBag;
  comments: number;
  shares: number;
  battleWins: number;
}

export interface ScenarioInput {
  /** Stable name — drives ids/timestamps. Defaults to "scenario". */
  seed?: string;
  crowns?: number;
  fires?: number;
  diamonds?: number;
  comments?: number;
  shares?: number;
  battleWins?: number;
  boostActive?: boolean;
  category?: CrownCategory;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

export interface PostFixture {
  id: string;
  user_id: string;
  category: CrownCategory;
  city: string | null;
  state: string | null;
  country: string | null;
  crown_score: number;
  vote_count: number;
  comment_count: number;
  share_count: number;
  battle_wins: number;
  is_removed: boolean;
  created_at: string;
}

export interface CommentFixture {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  is_removed: boolean;
  created_at: string;
}

export interface ShareFixture {
  id: string;
  post_id: string;
  user_id: string;
  channel: "link" | "dm" | "story";
  created_at: string;
}

export interface BattleFixture {
  id: string;
  status: "pending" | "active" | "completed";
  winner_id: string | null;
  challenger_id: string;
  opponent_id: string;
  challenger_post_id: string;
  opponent_post_id: string | null;
  challenger_votes: number;
  opponent_votes: number;
  created_at: string;
}

export interface BoostFixture {
  id: string;
  post_id: string;
  user_id: string;
  boost_type: "royal_boost";
  active: boolean;
  /** ISO string in the future when active, in the past when expired. */
  expires_at: string;
}

export interface ScoreScenario {
  input: Required<Omit<ScenarioInput, "seed" | "city" | "state" | "country">> & {
    seed: string;
    city: string | null;
    state: string | null;
    country: string | null;
  };
  post: PostFixture;
  comments: CommentFixture[];
  shares: ShareFixture[];
  battles: BattleFixture[];
  boost: BoostFixture | null;
  engagement: EngagementBag;
  /** Score the database trigger would produce for this scenario. */
  expectedScore: number;
}

// ─── Score oracle (mirrors recalc_post_score) ───────────────────────────────

/**
 * EXACTLY mirrors public.recalc_post_score():
 *   base   = crown*1 + fire*0.5 + diamond*1.5
 *   score  = (base + base*comments*0.01 + shares*0.25 + battle_wins*5) * boost
 */
export function recalcOracle(eng: EngagementBag, boostActive: boolean): number {
  const { crown, fire, diamond } = eng.votes;
  const base = crown * 1 + fire * 0.5 + diamond * 1.5;
  const boost = boostActive ? 1.5 : 1.0;
  return (base + base * (eng.comments * 0.01) + eng.shares * 0.25 + eng.battleWins * 5) * boost;
}

// ─── Builders ───────────────────────────────────────────────────────────────

export function makePost(seed: string, overrides: Partial<PostFixture> = {}): PostFixture {
  return {
    id: seededId(seed, "post"),
    user_id: seededId(seed, "user"),
    category: "overall",
    city: null,
    state: null,
    country: null,
    crown_score: 0,
    vote_count: 0,
    comment_count: 0,
    share_count: 0,
    battle_wins: 0,
    is_removed: false,
    created_at: seededTime(seed),
    ...overrides,
  };
}

export function makeComments(seed: string, postId: string, count: number): CommentFixture[] {
  return Array.from({ length: count }, (_, i) => ({
    id: seededId(`${seed}#cmt${i}`, "comment"),
    post_id: postId,
    user_id: seededId(`${seed}#cmt${i}`, "user"),
    body: `comment-${i + 1}`,
    is_removed: false,
    created_at: seededTime(`${seed}#cmt${i}`, i * 1000),
  }));
}

export function makeShares(seed: string, postId: string, count: number): ShareFixture[] {
  const channels: ShareFixture["channel"][] = ["link", "dm", "story"];
  return Array.from({ length: count }, (_, i) => ({
    id: seededId(`${seed}#shr${i}`, "share"),
    post_id: postId,
    user_id: seededId(`${seed}#shr${i}`, "user"),
    channel: channels[i % channels.length],
    created_at: seededTime(`${seed}#shr${i}`, i * 1000),
  }));
}

/**
 * Produces N completed battles where this post's owner is the winner —
 * matching what trg_battle_completed counts toward `posts.battle_wins`.
 */
export function makeBattles(seed: string, post: PostFixture, wins: number): BattleFixture[] {
  return Array.from({ length: wins }, (_, i) => {
    const opponentUser = seededId(`${seed}#opp${i}`, "user");
    const opponentPost = seededId(`${seed}#opp${i}`, "post");
    return {
      id: seededId(`${seed}#bat${i}`, "battle"),
      status: "completed" as const,
      winner_id: post.user_id,
      challenger_id: post.user_id,
      opponent_id: opponentUser,
      challenger_post_id: post.id,
      opponent_post_id: opponentPost,
      challenger_votes: 10 + i,
      opponent_votes: 5 + i,
      created_at: seededTime(`${seed}#bat${i}`, i * 1000),
    };
  });
}

export function makeBoost(seed: string, post: PostFixture, active: boolean): BoostFixture {
  // expires_at is +24h when active, -24h when expired — gives a deterministic
  // date that the RaceProgressBar boost-detection logic will classify correctly.
  const expiresAt = new Date(FIXED_EPOCH + (active ? 1 : -1) * 86_400_000).toISOString();
  return {
    id: seededId(`${seed}#boost`, "boost"),
    post_id: post.id,
    user_id: post.user_id,
    boost_type: "royal_boost",
    active,
    expires_at: expiresAt,
  };
}

// ─── One-shot scenario builder ──────────────────────────────────────────────

/**
 * Build a complete deterministic Crown Score scenario in one call.
 *
 * @example
 *   const s = scoreScenario({ crowns: 10, comments: 50, boostActive: true });
 *   expect(actualScore).toBeCloseTo(s.expectedScore, 9);
 *   expect(s.post.id).toBe(s.post.id); // stable across runs
 */
export function scoreScenario(input: ScenarioInput = {}): ScoreScenario {
  const filled = {
    seed: input.seed ?? "scenario",
    crowns: input.crowns ?? 0,
    fires: input.fires ?? 0,
    diamonds: input.diamonds ?? 0,
    comments: input.comments ?? 0,
    shares: input.shares ?? 0,
    battleWins: input.battleWins ?? 0,
    boostActive: input.boostActive ?? false,
    category: input.category ?? ("overall" as CrownCategory),
    city: input.city ?? null,
    state: input.state ?? null,
    country: input.country ?? null,
  };

  const engagement: EngagementBag = {
    votes: { crown: filled.crowns, fire: filled.fires, diamond: filled.diamonds },
    comments: filled.comments,
    shares: filled.shares,
    battleWins: filled.battleWins,
  };
  const expectedScore = recalcOracle(engagement, filled.boostActive);

  const post = makePost(filled.seed, {
    category: filled.category,
    city: filled.city,
    state: filled.state,
    country: filled.country,
    vote_count: filled.crowns + filled.fires + filled.diamonds,
    comment_count: filled.comments,
    share_count: filled.shares,
    battle_wins: filled.battleWins,
    crown_score: expectedScore,
  });

  return {
    input: filled,
    post,
    comments: makeComments(filled.seed, post.id, filled.comments),
    shares: makeShares(filled.seed, post.id, filled.shares),
    battles: makeBattles(filled.seed, post, filled.battleWins),
    boost: filled.boostActive ? makeBoost(filled.seed, post, true) : null,
    engagement,
    expectedScore,
  };
}
