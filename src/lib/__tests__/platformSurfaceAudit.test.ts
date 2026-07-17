import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

function filesUnder(path: string, extensions: ReadonlySet<string>): string[] {
  const absolute = join(root, path);
  return readdirSync(absolute).flatMap((entry) => {
    const child = join(absolute, entry);
    if (statSync(child).isDirectory()) {
      return filesUnder(child.slice(root.length + 1), extensions);
    }
    return extensions.has(entry.slice(entry.lastIndexOf("."))) ? [child] : [];
  });
}

const app = read("src/App.tsx");
const config = read("supabase/config.toml");
const generatedTypes = read("src/integrations/supabase/types.ts");
const reconcile = read("supabase/functions/royal-pass-reconcile/index.ts");
const reference = read("docs/CROWNME_PLATFORM_REFERENCE.md");

describe("platform surface inventory", () => {
  it("keeps every documented product route mounted", () => {
    const mounted = new Set([...app.matchAll(/path="([^"]+)"/g)].map((match) => match[1]));
    const absoluteMounted = [...mounted].filter((route) => route.startsWith("/")).sort();
    const documentedAbsolute = [...new Set(
      [...reference.matchAll(/`(\/(?:[^`\s]*))`/g)].map((match) => match[1]),
    )].sort();
    const nestedLine = reference.match(/Nested Command Center routes: ([^\n]+)/)?.[1] ?? "";
    const documentedNested = [...nestedLine.matchAll(/`([^`]+)`/g)]
      .map((match) => match[1])
      .sort();
    const nestedMounted = [...mounted]
      .filter((route) => !route.startsWith("/") && route !== "*")
      .sort();

    expect(documentedAbsolute).toEqual(absoluteMounted);
    expect(documentedNested).toEqual(nestedMounted);
    expect(mounted.size).toBe(125);
  });

  it("keeps every edge-function directory under an explicit gateway policy", () => {
    const functionDirs = readdirSync(join(root, "supabase/functions"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
      .map((entry) => entry.name)
      .sort();
    const configured = [...config.matchAll(/\[functions\.([^\]]+)\]/g)]
      .map((match) => match[1])
      .sort();

    expect(functionDirs).toHaveLength(36);
    expect(configured).toEqual(functionDirs);
    for (const name of functionDirs) {
      expect(config).toMatch(new RegExp(`\\[functions\\.${name.replaceAll("-", "\\-")}\\]\\s+verify_jwt = (?:true|false)`));
    }
  });

  it("keeps externally signed webhooks public and privileged jobs gateway-authenticated", () => {
    for (const name of ["payments-webhook", "revenuecat-webhook"]) {
      expect(config).toMatch(new RegExp(`\\[functions\\.${name}\\]\\s+verify_jwt = false`));
    }
    for (const name of ["royal-pass-reconcile", "royal-pass-comms-cron", "achievements-process-batch"] ) {
      expect(config).toMatch(new RegExp(`\\[functions\\.${name}\\]\\s+verify_jwt = true`));
    }
  });

  it("keeps every statically invoked RPC represented in generated database types", () => {
    const functionStart = generatedTypes.indexOf("    Functions: {");
    const functionEnd = generatedTypes.indexOf("    Enums: {", functionStart);
    const functionBlock = generatedTypes.slice(functionStart, functionEnd);
    const catalog = new Set([...functionBlock.matchAll(/^ {6}([a-zA-Z_][a-zA-Z0-9_]*):/gm)].map((match) => match[1]));
    const sources = [
      ...filesUnder("src", new Set([".ts", ".tsx"]))
        .filter((file) => !/(?:\/__tests__\/|\/test\/|\.(?:test|spec)\.)/.test(file)),
      ...filesUnder("supabase/functions", new Set([".ts", ".tsx"])),
    ].map((file) => readFileSync(file, "utf8")).join("\n");
    const invoked = new Set([...sources.matchAll(/\.rpc\(\s*["']([a-zA-Z_][a-zA-Z0-9_]*)["']/g)].map((match) => match[1]));

    expect(catalog.size).toBeGreaterThanOrEqual(240);
    expect(invoked.size).toBeGreaterThanOrEqual(150);
    expect([...invoked].filter((name) => !catalog.has(name)).sort()).toEqual([]);
  });
});

describe("launch-only surfaces fail closed", () => {
  it("does not expose the internal email-template preview publicly", () => {
    expect(app).toMatch(
      /path="\/email-template-preview"[^\n]+<ProtectedRoute><AdminRoute requireAdmin><EmailTemplatePreview/,
    );
  });

  it("authenticates reconciliation before Stripe or service-role data access", () => {
    expect(reconcile).toMatch(/isServiceRoleRequest\(req\)/);
    expect(reconcile).toMatch(/return json\(401, \{ error: "unauthorized" \}\)/);
    expect(reconcile.indexOf("isServiceRoleRequest(req)")).toBeLessThan(
      reconcile.indexOf("const admin = createClient"),
    );
  });

  it("keeps Profile from presenting transient query failures as an empty account", () => {
    const profile = read("src/pages/Profile.tsx");
    expect(profile).toMatch(/postsLoadState/);
    expect(profile).toMatch(/Posts couldn't refresh/);
    expect(profile).toMatch(/event: "INSERT"[^\n]+table: "posts"/);
  });
});
