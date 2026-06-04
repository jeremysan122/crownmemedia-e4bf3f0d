// ============================================================================
// Platform-wide Category System
//
// Source of truth for category hub navigation, picker UI, and category-scoped
// queries. The DB owns labels/icons; the existing CrownCategory enum stays as
// a legacy field, but every NEW write should also populate
// posts.main_category_slug + posts.subcategory_slug.
// ============================================================================
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MainCategory {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  icon: string | null;
  gradient: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface Subcategory {
  id: string;
  main_category_id: string;
  slug: string;
  label: string;
  description: string | null;
  legacy_enum: string | null;
  sort_order: number;
  is_active: boolean;
  is_featured: boolean;
}

let _mainCache: MainCategory[] | null = null;
let _subCache: Subcategory[] | null = null;

export async function fetchMainCategories(force = false): Promise<MainCategory[]> {
  if (_mainCache && !force) return _mainCache;
  const { data } = await supabase
    .from("main_categories" as any)
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  _mainCache = (data as any) || [];
  return _mainCache!;
}

export async function fetchSubcategories(force = false): Promise<Subcategory[]> {
  if (_subCache && !force) return _subCache;
  const { data } = await supabase
    .from("subcategories" as any)
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  _subCache = (data as any) || [];
  return _subCache!;
}

export function clearCategoryCache() {
  _mainCache = null;
  _subCache = null;
}

export function useMainCategories() {
  const [mains, setMains] = useState<MainCategory[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetchMainCategories().then((d) => {
      setMains(d);
      setLoading(false);
    });
  }, []);
  return { mains, loading };
}

export function useCategoryTree() {
  const [mains, setMains] = useState<MainCategory[]>([]);
  const [subs, setSubs] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([fetchMainCategories(), fetchSubcategories()]).then(([m, s]) => {
      setMains(m);
      setSubs(s);
      setLoading(false);
    });
  }, []);
  return { mains, subs, loading };
}

export function findSubByLegacy(subs: Subcategory[], legacy: string | null | undefined) {
  if (!legacy) return null;
  return subs.find((s) => s.legacy_enum === legacy) ?? null;
}

export function findMainForSub(mains: MainCategory[], sub: Subcategory | null) {
  if (!sub) return null;
  return mains.find((m) => m.id === sub.main_category_id) ?? null;
}

// ---------------------------------------------------------------------------
// Category-follows (per user)
// ---------------------------------------------------------------------------
export type FollowState = "following" | "hidden" | "favorite";

export async function toggleCategoryFollow(opts: {
  userId: string;
  mainCategoryId?: string | null;
  subcategoryId?: string | null;
  state: FollowState;
}) {
  const { userId, mainCategoryId = null, subcategoryId = null, state } = opts;
  // Delete any existing row with the same (user, main, sub, state) — toggle off
  const { data: existing } = await supabase
    .from("category_follows" as any)
    .select("id")
    .eq("user_id", userId)
    .eq("state", state)
    .eq(mainCategoryId ? "main_category_id" : "subcategory_id", mainCategoryId ?? subcategoryId);
  if (existing && existing.length > 0) {
    await supabase.from("category_follows" as any).delete().eq("id", (existing[0] as any).id);
    return { followed: false };
  }
  await supabase.from("category_follows" as any).insert({
    user_id: userId,
    main_category_id: mainCategoryId,
    subcategory_id: subcategoryId,
    state,
  });
  return { followed: true };
}

export async function fetchMyCategoryFollows(userId: string) {
  const { data } = await supabase
    .from("category_follows" as any)
    .select("main_category_id, subcategory_id, state")
    .eq("user_id", userId);
  return (data as any[]) || [];
}

// ---------------------------------------------------------------------------
// Category statistics (per user) — derived from posts table
// ---------------------------------------------------------------------------
export interface CategoryStat {
  main_slug: string;
  main_label: string;
  post_count: number;
  total_crown_score: number;
  crowns_won: number; // proxied as posts ranked #1 in their category
}

export async function fetchUserCategoryStats(userId: string): Promise<CategoryStat[]> {
  const { data } = await supabase
    .from("posts")
    .select("main_category_slug, crown_score")
    .eq("user_id", userId)
    .eq("is_removed", false)
    .not("main_category_slug", "is", null);
  const mains = await fetchMainCategories();
  const byMain = new Map<string, CategoryStat>();
  for (const m of mains) {
    byMain.set(m.slug, {
      main_slug: m.slug,
      main_label: m.label,
      post_count: 0,
      total_crown_score: 0,
      crowns_won: 0,
    });
  }
  ((data as any[]) || []).forEach((p) => {
    const row = byMain.get(p.main_category_slug);
    if (!row) return;
    row.post_count += 1;
    row.total_crown_score += Number(p.crown_score) || 0;
  });
  // crowns_won — pull from crowns table (active reigns)
  const { data: crowns } = await supabase
    .from("crowns")
    .select("category")
    .eq("user_id", userId)
    .eq("active", true);
  const subs = await fetchSubcategories();
  ((crowns as any[]) || []).forEach((c) => {
    const sub = subs.find((s) => s.legacy_enum === c.category);
    if (!sub) return;
    const main = mains.find((m) => m.id === sub.main_category_id);
    if (!main) return;
    const row = byMain.get(main.slug);
    if (row) row.crowns_won += 1;
  });
  return [...byMain.values()].filter((r) => r.post_count > 0 || r.crowns_won > 0)
    .sort((a, b) => b.crowns_won - a.crowns_won || b.total_crown_score - a.total_crown_score);
}
