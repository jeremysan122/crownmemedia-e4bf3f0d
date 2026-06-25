/**
 * Native push registration bridge.
 *
 * - Web push continues to work via the existing `useWebPush` hook + service worker.
 * - On iOS / Android (Capacitor), this module registers the device with APNs/FCM
 *   and stores the resulting token in `public.push_subscriptions` with
 *   `platform = 'ios' | 'android'`.
 *
 * Deep-link routing is delegated to `src/lib/notificationRouting.ts` so web and
 * native share the same handler table (DM thread, post, Scroll, battle, gift
 * receipt, verification, rewards, wallet/payout).
 */

import { supabase } from "@/integrations/supabase/client";
import { getNotificationTarget } from "@/lib/notificationRouting";

type RegisterResult =
  | { status: "registered"; token: string; platform: "ios" | "android" }
  | { status: "denied" }
  | { status: "unsupported" }
  | { status: "error"; error: string };

function isNative(): boolean {
  try {
    return Boolean((globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export async function registerNativePush(userId: string): Promise<RegisterResult> {
  if (!isNative()) return { status: "unsupported" };

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const { App } = await import("@capacitor/app");

    const perm = await PushNotifications.checkPermissions();
    let status = perm.receive;
    if (status === "prompt" || status === "prompt-with-rationale") {
      const req = await PushNotifications.requestPermissions();
      status = req.receive;
    }
    if (status !== "granted") return { status: "denied" };

    const platform = ((globalThis as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() ?? "web") as
      | "ios"
      | "android";

    return await new Promise<RegisterResult>((resolve) => {
      const cleanup: Array<() => void> = [];

      PushNotifications.addListener("registration", async (token) => {
        try {
          // Persist token. `endpoint` reuses the existing column; `p256dh`/`auth`
          // stay null for native rows. `user_agent` carries the platform marker
          // for the send-side router (`send-native-push`).
          await supabase
            .from("push_subscriptions")
            .upsert(
              {
                user_id: userId,
                endpoint: `${platform}:${token.value}`,
                p256dh: null,
                auth: null,
                user_agent: platform,
                last_seen_at: new Date().toISOString(),
              },
              { onConflict: "endpoint" },
            );
          resolve({ status: "registered", token: token.value, platform });
        } catch (e) {
          resolve({ status: "error", error: (e as Error).message });
        } finally {
          cleanup.forEach((fn) => fn());
        }
      }).then((h) => cleanup.push(() => h.remove()));

      PushNotifications.addListener("registrationError", (err) => {
        cleanup.forEach((fn) => fn());
        resolve({ status: "error", error: String(err?.error ?? err) });
      }).then((h) => cleanup.push(() => h.remove()));

      // Deep-link handler — reuses the shared web router so both surfaces stay
      // aligned. Never log payload contents (privacy on lockscreen previews is
      // enforced at the send side via `content-available` minimal payloads).
      PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const data = (action.notification?.data ?? {}) as Record<string, unknown>;
        try {
          const target = getNotificationTarget({
            type: String(data.type ?? ""),
            payload: data,
          });
          if (target) window.location.assign(target);
        } catch {
          /* swallow — never crash on bad payload */
        }
      }).then((h) => cleanup.push(() => h.remove()));

      // Foreground notification — surface via App listener for analytics only.
      PushNotifications.addListener("pushNotificationReceived", () => {
        /* leave UI to in-app toast layer */
      }).then((h) => cleanup.push(() => h.remove()));

      App.addListener("appUrlOpen", (event) => {
        // Universal links / app links fall back to the web router.
        try {
          const url = new URL(event.url);
          window.location.assign(url.pathname + url.search);
        } catch {
          /* noop */
        }
      }).then((h) => cleanup.push(() => h.remove()));

      PushNotifications.register().catch((e) => {
        cleanup.forEach((fn) => fn());
        resolve({ status: "error", error: (e as Error).message });
      });
    });
  } catch (e) {
    return { status: "error", error: (e as Error).message };
  }
}

export function isNativePushSupported(): boolean {
  return isNative();
}
