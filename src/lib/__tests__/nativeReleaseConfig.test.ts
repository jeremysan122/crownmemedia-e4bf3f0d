import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const capacitorConfig = readFileSync(
  resolve(process.cwd(), "capacitor.config.ts"),
  "utf8",
);

describe("native release configuration", () => {
  it("uses CrownMe's production application identifier", () => {
    expect(capacitorConfig).toContain('appId: "com.crownmemedia.app"');
    expect(capacitorConfig).not.toContain("app.lovable.");
  });

  it("ships the local web bundle instead of a remote development server", () => {
    expect(capacitorConfig).toContain('webDir: "dist"');
    expect(capacitorConfig).not.toMatch(/\bserver\s*:/);
    expect(capacitorConfig).not.toMatch(/cleartext\s*:\s*true/);
  });
});
