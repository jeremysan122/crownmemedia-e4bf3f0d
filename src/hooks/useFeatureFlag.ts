// Wave 3: React hook wrapper around the `is_feature_enabled` RPC.
// Uses the shared in-memory cache from lib/featureFlags so pages that call
// the same flag on mount don't hammer the RPC.
import { useEffect, useState } from "react";
import { isFeatureEnabled } from "@/lib/featureFlags";

/**
 * Returns:
 *   - `null` while the initial resolution is in flight (render a skeleton)
 *   - `true` / `false` once the RPC responds
 *
 * `defaultValue` is returned immediately when we have no answer yet AND on
 * any RPC failure — pick `true` for graceful degradation on user-facing
 * features that already shipped.
 */
export function useFeatureFlag(key: string, defaultValue = false): boolean | null {
  const [value, setValue] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    isFeatureEnabled(key)
      .then((v) => { if (!cancelled) setValue(v); })
      .catch(() => { if (!cancelled) setValue(defaultValue); });
    return () => { cancelled = true; };
  }, [key, defaultValue]);

  return value;
}
