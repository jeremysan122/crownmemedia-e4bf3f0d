import { describe, it, expect } from "vitest";
import { lookupGeo } from "../geoCoords";

function near(a: [number, number] | null, b: [number, number], tol = 1.5) {
  expect(a).not.toBeNull();
  expect(Math.abs(a![0] - b[0])).toBeLessThan(tol);
  expect(Math.abs(a![1] - b[1])).toBeLessThan(tol);
}

describe("geoCoords lookup", () => {
  it("resolves Canadian cities near their actual centers", () => {
    near(lookupGeo("Edmonton", "city"), [53.5461, -113.4938]);
    near(lookupGeo("Calgary", "city"), [51.0447, -114.0719]);
    near(lookupGeo("Toronto", "city"), [43.6510, -79.3470]);
  });

  it("resolves US cities including Wisconsin ones", () => {
    near(lookupGeo("Green Bay", "city"), [44.5133, -88.0133]);
    near(lookupGeo("Milwaukee", "city"), [43.0389, -87.9065]);
    near(lookupGeo("Memphis", "city"), [35.1495, -90.0490]);
  });

  it("resolves Canadian provinces (full name and abbreviation)", () => {
    near(lookupGeo("Alberta", "state"), [53.9333, -116.5765]);
    near(lookupGeo("AB", "state"), [53.9333, -116.5765]);
    near(lookupGeo("Ontario", "state"), [51.2538, -85.3232]);
    near(lookupGeo("BC", "state"), [53.7267, -127.6476]);
  });

  it("resolves US state abbreviations", () => {
    near(lookupGeo("WI", "state"), [44.2685, -89.6165]);
    near(lookupGeo("TN", "state"), [35.7478, -86.6923]);
    near(lookupGeo("CA", "state"), [36.1162, -119.6816]); // California
  });

  it("normalizes punctuation and aliases for country lookup", () => {
    near(lookupGeo("USA", "country"), [37.09024, -95.712891]);
    near(lookupGeo("U.S.", "country"), [37.09024, -95.712891]);
    near(lookupGeo("United States of America", "country"), [37.09024, -95.712891]);
    // CA as country means Canada, not California
    near(lookupGeo("CA", "country"), [56.130366, -106.346771]);
  });

  it("returns null (not a fake coord) for unknown regions", () => {
    expect(lookupGeo("Zzzz Not A Real City", "city")).toBeNull();
    expect(lookupGeo("Wakanda", "country")).toBeNull();
    expect(lookupGeo("", "city")).toBeNull();
  });
});
