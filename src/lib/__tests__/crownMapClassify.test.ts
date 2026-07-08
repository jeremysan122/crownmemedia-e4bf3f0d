import { describe, it, expect } from "vitest";
import { classifyCrownRows, type CrownRow } from "@/lib/crownMapClassify";

const base = (over: Partial<CrownRow> = {}): CrownRow => ({
  region_name: "Edmonton",
  region_type: "city",
  user_id: "u1",
  post_id: "p1",
  crown_score: 100,
  category: "overall",
  profile: { username: "alice", profile_photo_url: null },
  post: {
    city: null, state: null, country: null,
    location_enabled: false, location_source: "none",
    post_lat: null, post_lng: null, post_location_precision: "none",
  },
  ...over,
});

describe("classifyCrownRows", () => {
  it("puts a consented exact-coord post in mapped with precision=exact", () => {
    const { mapped, unmapped } = classifyCrownRows([
      base({
        post: {
          city: null, state: null, country: null,
          location_enabled: true, location_source: "current_location",
          post_lat: 53.5, post_lng: -113.5, post_location_precision: "exact",
        },
      }),
    ]);
    expect(mapped).toHaveLength(1);
    expect(unmapped).toHaveLength(0);
    expect(mapped[0].precision).toBe("exact");
    expect(mapped[0].coord).toEqual([53.5, -113.5]);
  });

  it("uses city center when posts.city matches curated data", () => {
    const { mapped, unmapped } = classifyCrownRows([
      base({ post: { ...base().post!, city: "Edmonton" } }),
    ]);
    expect(unmapped).toHaveLength(0);
    expect(mapped[0].precision).toBe("city");
  });

  it("puts unknown regions into unmapped instead of inventing a coord", () => {
    const { mapped, unmapped } = classifyCrownRows([
      base({ region_type: "city", region_name: "Nowhereville", post: null }),
    ]);
    expect(mapped).toHaveLength(0);
    expect(unmapped).toHaveLength(1);
  });

  it("ignores exact coords when user did not consent", () => {
    const { mapped, unmapped } = classifyCrownRows([
      base({
        region_type: "city",
        region_name: "Nowhereville",
        post: {
          city: null, state: null, country: null,
          location_enabled: false, location_source: "manual",
          post_lat: 12, post_lng: 34, post_location_precision: "exact",
        },
      }),
    ]);
    expect(unmapped).toHaveLength(1);
    expect(mapped).toHaveLength(0);
  });


  it("splits mapped vs unmapped in one pass", () => {
    const { mapped, unmapped } = classifyCrownRows([
      base({ post_id: "a", post: { ...base().post!, city: "Edmonton" } }),
      base({ post_id: "b", region_name: "Nowhereville", post: null }),
      base({ post_id: "c", region_type: "country", region_name: "Canada", post: null }),
    ]);
    expect(mapped.map((m) => m.r.post_id).sort()).toEqual(["a", "c"]);
    expect(unmapped.map((u) => u.post_id)).toEqual(["b"]);
  });

  it("global region always maps to [0,0] and never enters unmapped", () => {
    const { mapped, unmapped } = classifyCrownRows([
      base({ region_type: "global", region_name: "World", post: null }),
    ]);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].coord).toEqual([0, 0]);
    expect(unmapped).toHaveLength(0);
  });
});
