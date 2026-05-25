import { useCallback, useEffect, useState } from "react";

/**
 * Per-user gift favourites stored in localStorage (no DB schema change required).
 * Order is preserved — the most recently pinned gift appears first so the
 * Quick Send rail surfaces what the sender actually uses most.
 */
const KEY = "crownme.gifts.favorites";
const MAX = 12;

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX)));
  // Notify other listeners in the same tab
  window.dispatchEvent(new CustomEvent("crownme:favorites-changed"));
}

export function useGiftFavorites() {
  const [ids, setIds] = useState<string[]>(() => read());

  useEffect(() => {
    const onChange = () => setIds(read());
    window.addEventListener("crownme:favorites-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("crownme:favorites-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const isFavorite = useCallback((id: string) => ids.includes(id), [ids]);

  const toggle = useCallback((id: string) => {
    const current = read();
    const next = current.includes(id) ? current.filter((x) => x !== id) : [id, ...current.filter((x) => x !== id)];
    write(next);
    setIds(next);
  }, []);

  const pinFront = useCallback((id: string) => {
    const current = read();
    if (current[0] === id) return;
    const next = [id, ...current.filter((x) => x !== id)];
    write(next);
    setIds(next);
  }, []);

  return { favorites: ids, isFavorite, toggle, pinFront };
}
