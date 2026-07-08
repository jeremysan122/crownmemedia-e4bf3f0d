import { describe, it, expect } from "vitest";
import { lookupPostGeo } from "@/lib/geoCoords";

describe("lookupPostGeo — pin the crowned POST, not the user", () => {
  it("uses exact post coords only when consent + source = current_location", () => {
    const r = lookupPostGeo({
      post_lat: 12.34,
      post_lng: 56.78,
      location_enabled: true,
      location_source: "current_location",
      region_type: "city",
      region_name: "unknown place",
    });
    expect(r.coord).toEqual([12.34, 56.78]);
    expect(r.precision).toBe("exact");
  });

  it("ignores exact coords when consent is missing", () => {
    const r = lookupPostGeo({
      post_lat: 12.34,
      post_lng: 56.78,
      location_enabled: false,
      location_source: "current_location",
      city: "Edmonton",
    });
    expect(r.precision).toBe("city");
    expect(r.coord).not.toEqual([12.34, 56.78]);
  });

  it("ignores exact coords when source != current_location", () => {
    const r = lookupPostGeo({
      post_lat: 12.34,
      post_lng: 56.78,
      location_enabled: true,
      location_source: "manual",
      city: "Calgary",
    });
    expect(r.precision).toBe("city");
  });

  it("falls back to safe city center from posts.city", () => {
    const r = lookupPostGeo({ city: "Edmonton" });
    expect(r.precision).toBe("city");
    expect(r.coord).not.toBeNull();
  });

  it("falls back to region name when city is missing", () => {
    const r = lookupPostGeo({ region_type: "state", region_name: "Alberta" });
    expect(r.precision).toBe("state");
    expect(r.coord).not.toBeNull();
  });

  it("returns null (unmapped) when nothing is known — never invents a coord", () => {
    const r = lookupPostGeo({ region_type: "city", region_name: "Nowhereville" });
    expect(r.coord).toBeNull();
    expect(r.precision).toBe("none");
  });
});
