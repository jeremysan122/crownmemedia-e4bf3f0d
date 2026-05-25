import { z } from "zod";

// Conservative, explicit list — keeps false positives low. Matches whole tokens
// only and tolerates simple leetspeak (e.g. "f*ck", "sh!t").
const BAD_WORDS = [
  "fuck", "shit", "bitch", "asshole", "cunt", "dick", "pussy", "faggot",
  "nigger", "nigga", "retard", "slut", "whore", "kike", "spic", "chink",
];

const LEET_MAP: Record<string, string> = {
  "0": "o", "1": "i", "!": "i", "3": "e", "4": "a", "@": "a",
  "5": "s", "$": "s", "7": "t", "*": "", ".": "",
};

function normalize(input: string) {
  return input
    .toLowerCase()
    .split("")
    .map((ch) => LEET_MAP[ch] ?? ch)
    .join("");
}

export function findProfanity(text: string): string | null {
  const norm = normalize(text);
  for (const w of BAD_WORDS) {
    const re = new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, "i");
    if (re.test(norm)) return w;
  }
  return null;
}

export const commentSchema = z
  .string()
  .trim()
  .min(1, { message: "Comment cannot be empty" })
  .max(500, { message: "Comment must be 500 characters or fewer" })
  .refine((v) => !/^(.)\1{19,}$/.test(v), { message: "Please don't spam repeated characters" })
  .refine((v) => (v.match(/https?:\/\//gi) ?? []).length <= 2, {
    message: "Too many links in one comment",
  })
  .refine((v) => findProfanity(v) === null, {
    message: "Please keep it royal — profanity isn't allowed",
  });

export type CommentValidation =
  | { ok: true; value: string }
  | { ok: false; message: string };

export function validateComment(raw: string): CommentValidation {
  const r = commentSchema.safeParse(raw);
  if (!r.success) return { ok: false, message: r.error.issues[0]?.message ?? "Invalid comment" };
  return { ok: true, value: r.data };
}

// ---------- Client-side rate limiting ----------
// Per-user: max 5 comments per 30s and min 2s between comments.
const RATE_KEY = "crownme:comment-times";

function readTimes(): number[] {
  try {
    const raw = localStorage.getItem(RATE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((n) => typeof n === "number") : [];
  } catch { return []; }
}

function writeTimes(times: number[]) {
  try { localStorage.setItem(RATE_KEY, JSON.stringify(times.slice(-20))); } catch {}
}

export interface RateCheck {
  ok: boolean;
  /** seconds the user must wait before posting again */
  retryInSec?: number;
  message?: string;
}

const WINDOW_MS = 30_000;
const MAX_PER_WINDOW = 5;
const MIN_GAP_MS = 2_000;

export function checkCommentRate(now: number = Date.now()): RateCheck {
  const times = readTimes().filter((t) => now - t < WINDOW_MS);
  const last = times[times.length - 1];
  if (last && now - last < MIN_GAP_MS) {
    return { ok: false, retryInSec: Math.ceil((MIN_GAP_MS - (now - last)) / 1000), message: "You're commenting too fast. Slow down a bit." };
  }
  if (times.length >= MAX_PER_WINDOW) {
    const oldest = times[0];
    return { ok: false, retryInSec: Math.ceil((WINDOW_MS - (now - oldest)) / 1000), message: "Comment limit reached — take a breath." };
  }
  return { ok: true };
}

export function recordComment(now: number = Date.now()) {
  const times = readTimes().filter((t) => now - t < WINDOW_MS);
  times.push(now);
  writeTimes(times);
}
