// Keyed scroll-position restoration.
//
// Store/restore scroll position for a list-like surface (Feed, Discover,
// Scrolls, Profile, Battles) keyed by route + tab. Persists across
// back-navigation, browser reloads, and tab switches via sessionStorage.
//
// Usage:
//   const ref = useRef<HTMLElement | null>(null);
//   useScrollRestoration("feed:global", ref, { ready: !loading });
//
// Notes:
// - The hook only restores once `ready === true` to avoid restoring before
//   the list has rendered the rows below the saved offset.
// - We sample on scroll (rAF-throttled) and on pagehide/visibilitychange so
//   the offset survives even abrupt navigations.
// - The store is sessionStorage so it never leaks across browser sessions.
import { useEffect, useRef } from "react";

const STORAGE_PREFIX = "crownme:scroll:";
const MAX_KEYS = 50; // FIFO cap so the store doesn't grow unbounded.
const recentKeys: string[] = [];

function readSession(): Storage | null {
  try { return typeof window !== "undefined" ? window.sessionStorage : null; } catch { return null; }
}

export function saveScrollPosition(key: string, top: number): void {
  const ss = readSession();
  if (!ss) return;
  try {
    ss.setItem(STORAGE_PREFIX + key, String(Math.max(0, Math.round(top))));
    const idx = recentKeys.indexOf(key);
    if (idx >= 0) recentKeys.splice(idx, 1);
    recentKeys.push(key);
    while (recentKeys.length > MAX_KEYS) {
      const evict = recentKeys.shift();
      if (evict) ss.removeItem(STORAGE_PREFIX + evict);
    }
  } catch { /* quota / privacy mode — silent */ }
}

export function readScrollPosition(key: string): number | null {
  const ss = readSession();
  if (!ss) return null;
  try {
    const raw = ss.getItem(STORAGE_PREFIX + key);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch { return null; }
}

export function clearScrollPosition(key: string): void {
  const ss = readSession();
  if (!ss) return;
  try { ss.removeItem(STORAGE_PREFIX + key); } catch { /* noop */ }
}

interface Options {
  /** Only restore once the list has loaded enough rows for the offset to be valid. */
  ready?: boolean;
  /** Override sampler — defaults to scrollTop on element, scrollY on window. */
  getOffset?: () => number;
  /** Override restore — defaults to element.scrollTo / window.scrollTo. */
  setOffset?: (top: number) => void;
}

export function useScrollRestoration(
  key: string,
  scrollEl: React.RefObject<HTMLElement | null> | null,
  options: Options = {},
): void {
  const { ready = true, getOffset, setOffset } = options;
  const restoredRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  // Restore once ready
  useEffect(() => {
    if (!ready || restoredRef.current) return;
    const saved = readScrollPosition(key);
    if (saved == null) { restoredRef.current = true; return; }
    const apply = () => {
      if (setOffset) setOffset(saved);
      else if (scrollEl?.current) scrollEl.current.scrollTo({ top: saved, behavior: "auto" });
      else if (typeof window !== "undefined") window.scrollTo({ top: saved, behavior: "auto" });
      restoredRef.current = true;
    };
    // Two rAFs — layout often pushes more rows on the second frame.
    if (typeof window !== "undefined" && "requestAnimationFrame" in window) {
      window.requestAnimationFrame(() => window.requestAnimationFrame(apply));
    } else {
      apply();
    }
  }, [ready, key, scrollEl, setOffset]);

  // Sampler: track offset, persist on pagehide/visibilitychange/unmount.
  useEffect(() => {
    const target: HTMLElement | Window | null =
      scrollEl?.current ?? (typeof window !== "undefined" ? window : null);
    if (!target) return;

    const sample = () => {
      if (getOffset) return getOffset();
      if (scrollEl?.current) return scrollEl.current.scrollTop;
      if (typeof window !== "undefined") return window.scrollY;
      return 0;
    };
    const onScroll = () => {
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        saveScrollPosition(key, sample());
      });
    };
    const onLeave = () => saveScrollPosition(key, sample());

    target.addEventListener("scroll", onScroll, { passive: true } as AddEventListenerOptions);
    window.addEventListener("pagehide", onLeave);
    document.addEventListener("visibilitychange", onLeave);
    return () => {
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onLeave);
      document.removeEventListener("visibilitychange", onLeave);
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
      onLeave();
    };
  }, [key, scrollEl, getOffset]);
}

// Test-only — clear in-memory FIFO without touching sessionStorage so tests
// can simulate cold loads without leaking across cases.
export function __resetScrollRestorationForTests(): void {
  recentKeys.length = 0;
  const ss = readSession();
  if (!ss) return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < ss.length; i++) {
      const k = ss.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => ss.removeItem(k));
  } catch { /* noop */ }
}
