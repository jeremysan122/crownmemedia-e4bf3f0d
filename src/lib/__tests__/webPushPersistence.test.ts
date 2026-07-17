import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const hook = readFileSync(join(process.cwd(), "src", "hooks", "useWebPush.ts"), "utf8");
const settings = readFileSync(join(process.cwd(), "src", "pages", "Settings.tsx"), "utf8");

describe("web-push persistence contract", () => {
  it("loads the VAPID key through the authenticated function client", () => {
    expect(hook).toMatch(/supabase\.functions\.invoke\("web-push-public-key"/);
    expect(hook).not.toMatch(/fetch\(VAPID_PUBLIC_KEY_ENDPOINT\)/);
  });

  it("persists and verifies both the device subscription and push preference", () => {
    expect(hook).toMatch(/rpc\("save_push_subscription"/);
    expect(hook).toMatch(/notification_preferences[\s\S]+?push_enabled: true/);
    expect(hook).toMatch(/push_subscriptions[\s\S]+?\.eq\("endpoint", endpoint\)[\s\S]+?maybeSingle/);
  });

  it("reports on only when browser and backend state agree", () => {
    expect(hook).toMatch(/getSubscription\(\)[\s\S]+?push_subscriptions[\s\S]+?notification_preferences/);
    expect(hook).toMatch(/setState\(persisted && preference\?\.push_enabled \? "on" : "off"\)/);
  });

  it("routes both settings controls through the same durable operation", () => {
    expect(settings).toMatch(/const setPushEnabled = async \(enabled: boolean\)/);
    expect(settings).toMatch(/onClick=\{\(\) => void setPushEnabled\(pushState !== "on"\)\}/);
    expect(settings).toMatch(/key === "push_enabled"[\s\S]+?await setPushEnabled\(v\)/);
  });
});
