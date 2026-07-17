import { describe, expect, it } from "vitest";
import { validatePublicRuntimeConfig } from "@/lib/runtimeConfig";

const valid = {
  VITE_SUPABASE_URL: "https://bailrqskqpmzvsgivhvm.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "public-anon-key",
  VITE_SUPABASE_PROJECT_ID: "bailrqskqpmzvsgivhvm",
};

describe("validatePublicRuntimeConfig", () => {
  it("accepts a matching production project", () => {
    expect(validatePublicRuntimeConfig(valid)).toMatchObject({ isValid: true, errors: [] });
  });

  it("fails safely when required deployment variables are missing", () => {
    const result = validatePublicRuntimeConfig({});
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("VITE_SUPABASE_URL is missing or invalid");
    expect(result.errors).toContain("VITE_SUPABASE_PUBLISHABLE_KEY is missing or invalid");
    expect(result.errors).toContain("VITE_SUPABASE_PROJECT_ID is missing");
  });

  it("rejects a project id that does not match the URL", () => {
    const result = validatePublicRuntimeConfig({ ...valid, VITE_SUPABASE_PROJECT_ID: "wrong-project" });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("VITE_SUPABASE_PROJECT_ID does not match VITE_SUPABASE_URL");
  });

  it("rejects an insecure independent reporting endpoint", () => {
    const result = validatePublicRuntimeConfig({ ...valid, VITE_ERROR_REPORTING_ENDPOINT: "http://errors.example.com" });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("VITE_ERROR_REPORTING_ENDPOINT must be a valid HTTPS URL");
  });
});
