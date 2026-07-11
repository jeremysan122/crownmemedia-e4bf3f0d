/**
 * Classify Crown Map rows into mapped (has a real coordinate) vs unmapped
 * (crowned post, but no exact consented coord AND no matching city / region
 * center). The unmapped rows are rendered as a dedicated "Unmapped crowned
 * posts" section so that a crowned post is never silently hidden and never
 * shown at a fake fallback position.
 *
 * Extracted from CrownMap.tsx so it can be unit-tested without spinning up
 * the whole map / Mapbox.
 */
import { lookupPostGeo, type LatLng } from "./geoCoords";

export type CrownRow = {
  region_name: string;
  region_type: "global" | "country" | "state" | "city";
  user_id: string;
  post_id: string | null;
  crown_score: number;
  category: string;
  profile: { username: string; profile_photo_url: string | null } | null;
  post?: {
    city: string | null;
    state: string | null;
    country: string | null;
    location_enabled: boolean | null;
    location_source: string | null;
    // Exact coords are no longer readable client-side (column-level revoke).
    // Kept optional here for legacy callers/tests; classifier always falls
    // back to city/state/country centers when they're absent.
    post_lat?: number | null;
    post_lng?: number | null;
    post_location_precision: string | null;
    image_url?: string | null;
    caption?: string | null;
  } | null;

};

export type MappedPoint<R extends CrownRow = CrownRow> = {
  r: R;
  coord: LatLng;
  precision: "exact" | "city" | "state" | "country";
};

export function classifyCrownRows<R extends CrownRow>(rows: R[]): {
  mapped: MappedPoint<R>[];
  unmapped: R[];
} {
  const mapped: MappedPoint<R>[] = [];
  const unmapped: R[] = [];
  for (const r of rows) {
    if (r.region_type === "global") {
      mapped.push({ r, coord: [0, 0], precision: "country" });
      continue;
    }
    const geo = lookupPostGeo({
      post_lat: r.post?.post_lat ?? null,
      post_lng: r.post?.post_lng ?? null,
      location_enabled: r.post?.location_enabled ?? null,
      location_source: r.post?.location_source ?? null,
      city: r.post?.city ?? null,
      state: r.post?.state ?? null,
      country: r.post?.country ?? null,
      region_type: r.region_type,
      region_name: r.region_name,
    });
    if (geo.coord && geo.precision !== "none") {
      mapped.push({ r, coord: geo.coord, precision: geo.precision });
    } else {
      unmapped.push(r);
    }
  }
  return { mapped, unmapped };
}
