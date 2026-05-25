import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { v: boolean; at: number }>();
const TTL_MS = 60_000;

/**
 * Check whether a feature flag is enabled for the current user.
 * Server-side resolved via `is_feature_enabled` RPC — respects audience + rollout %.
 * 60s in-memory cache to keep the feed snappy.
 */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v;
  try {
    const { data, error } = await supabase.rpc("is_feature_enabled", { _key: key });
    if (error) return false;
    const v = Boolean(data);
    cache.set(key, { v, at: Date.now() });
    return v;
  } catch {
    return false;
  }
}

export function clearFeatureFlagCache() {
  cache.clear();
}
