import { beforeEach, describe, expect, it } from "vitest";
import { getCookieConsent, setCookieConsent } from "@/lib/cookieConsent";

describe("cookie consent", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to no optional consent", () => {
    expect(getCookieConsent()).toBeNull();
  });

  it.each(["accepted", "rejected"] as const)("persists %s", (choice) => {
    setCookieConsent(choice);
    expect(getCookieConsent()).toBe(choice);
  });

  it("ignores unknown stored values", () => {
    localStorage.setItem("cm:cookie-consent:v1", "maybe");
    expect(getCookieConsent()).toBeNull();
  });
});
