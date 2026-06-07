// ============================================================================
// CrownMe Master Category List — official source of truth
//
// This is the authoritative naming layer for the platform's 15 Master
// Categories and 180 Topics, sourced from the uploaded "CrownMe Master
// Category List" PDF. The underlying database tables are `main_categories`
// (Master Category) and `subcategories` (Topic) — this module exposes them
// using the official terminology so new code can use `MasterCategory` /
// `Topic` without coupling to the legacy table names.
//
// Posts persist `main_category_slug` (Master) and `subcategory_slug` (Topic).
// Old `posts.category` enum values are preserved and back-filled into the
// official slugs via `subcategories.legacy_enum`.
// ============================================================================
import {
  fetchMainCategories,
  fetchSubcategories,
  useCategoryTree,
  useMainCategories,
  type MainCategory,
  type Subcategory,
} from "@/lib/categories";

export type MasterCategory = MainCategory;
export type Topic = Subcategory;

export const fetchMasterCategories = fetchMainCategories;
export const fetchTopics = fetchSubcategories;
export const useMasterCategories = useMainCategories;

/** Hook returning the full official tree: 15 Master Categories + 180 Topics. */
export function useMasterCategoryTree() {
  const { mains, subs, loading } = useCategoryTree();
  return { masters: mains, topics: subs, loading };
}

/** Topics belonging to a given Master Category slug. */
export function topicsForMaster(
  topics: Topic[],
  masters: MasterCategory[],
  masterSlug: string | null | undefined,
): Topic[] {
  if (!masterSlug) return [];
  const master = masters.find((m) => m.slug === masterSlug);
  if (!master) return [];
  return topics
    .filter((t) => t.main_category_id === master.id)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** Lookup helpers by slug. */
export function findMasterBySlug(masters: MasterCategory[], slug: string | null | undefined) {
  if (!slug) return null;
  return masters.find((m) => m.slug === slug) ?? null;
}
export function findTopicBySlug(topics: Topic[], slug: string | null | undefined) {
  if (!slug) return null;
  return topics.find((t) => t.slug === slug) ?? null;
}

/**
 * Resolve a legacy `posts.category` enum value (e.g. `best_style`, `overall`)
 * into the official Topic. Returns null if no mapping exists.
 */
export function resolveLegacyCategory(topics: Topic[], legacy: string | null | undefined) {
  if (!legacy) return null;
  return topics.find((t) => t.legacy_enum === legacy) ?? null;
}
