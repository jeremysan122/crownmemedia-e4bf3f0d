import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const VAPID_PUBLIC_KEY_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-push-public-key`;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

function bufToBase64(buf: ArrayBuffer | null) {
  if (!buf) return "";
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

export type PushState = "unsupported" | "denied" | "off" | "on" | "loading";

/**
 * Hook that manages the user's Web Push subscription.
 * - Detects browser support and permission
 * - Registers /sw.js
 * - Calls the `web-push-public-key` edge function to retrieve the server VAPID public key
 * - Subscribes / unsubscribes and persists the subscription via `save_push_subscription` RPC
 */
export function useWebPush() {
  const [state, setState] = useState<PushState>("loading");

  const supported = typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;

  const refresh = useCallback(async () => {
    if (!supported) { setState("unsupported"); return; }
    if (Notification.permission === "denied") { setState("denied"); return; }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    } catch {
      setState("off");
    }
  }, [supported]);

  useEffect(() => {
    if (!supported) { setState("unsupported"); return; }
    navigator.serviceWorker.register("/sw.js").then(refresh).catch(() => setState("off"));
  }, [supported, refresh]);

  const enable = useCallback(async () => {
    if (!supported) return;
    setState("loading");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }

      const res = await fetch(VAPID_PUBLIC_KEY_ENDPOINT);
      if (!res.ok) throw new Error("VAPID public key unavailable");
      const { publicKey } = await res.json();
      if (!publicKey) throw new Error("Push not configured");

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const endpoint = json.endpoint ?? sub.endpoint;
      const p256dh = json.keys?.p256dh ?? bufToBase64(sub.getKey("p256dh"));
      const authKey = json.keys?.auth ?? bufToBase64(sub.getKey("auth"));

      const { error } = await supabase.rpc("save_push_subscription", {
        _endpoint: endpoint,
        _p256dh: p256dh,
        _auth: authKey,
        _user_agent: navigator.userAgent.slice(0, 200),
      });
      if (error) throw error;

      setState("on");
      toast.success("Push notifications enabled");
    } catch (e: any) {
      console.error("push enable failed", e);
      toast.error(e?.message ?? "Could not enable push");
      await refresh();
    }
  }, [supported, refresh]);

  const disable = useCallback(async () => {
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
      }
      setState("off");
      toast.success("Push notifications disabled");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not disable push");
      await refresh();
    }
  }, [refresh]);

  return { state, supported, enable, disable, refresh };
}
