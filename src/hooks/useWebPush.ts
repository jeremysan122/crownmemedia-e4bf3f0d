import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { toFriendlyMessage, logRawError } from "@/lib/settingsSecurityErrors";

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
    let browserSub: PushSubscription | null = null;
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        toast.error(perm === "denied"
          ? "Push permission denied. Enable notifications in your browser settings."
          : "Couldn't enable push notifications. Try again.");
        return;
      }

      const res = await fetch(VAPID_PUBLIC_KEY_ENDPOINT);
      if (!res.ok) throw new Error("VAPID public key unavailable");
      const { publicKey } = await res.json();
      if (!publicKey) throw new Error("Push not configured");

      const reg = await navigator.serviceWorker.ready;
      browserSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const json = browserSub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const endpoint = json.endpoint ?? browserSub.endpoint;
      const p256dh = json.keys?.p256dh ?? bufToBase64(browserSub.getKey("p256dh"));
      const authKey = json.keys?.auth ?? bufToBase64(browserSub.getKey("auth"));

      const { error } = await supabase.rpc("save_push_subscription", {
        _endpoint: endpoint,
        _p256dh: p256dh,
        _auth: authKey,
        _user_agent: navigator.userAgent.slice(0, 200),
      });
      if (error) {
        // Server-side save failed — roll back the browser subscription so
        // the UI state stays truthful and we don't leak a phantom sub.
        try { await browserSub.unsubscribe(); } catch { /* noop */ }
        throw error;
      }

      setState("on");
      toast.success("Push notifications enabled");
    } catch (e: unknown) {
      logRawError(e, "push_enable");
      toast.error(toFriendlyMessage(e, "push_enable"));
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
    } catch (e: unknown) {
      logRawError(e, "push_disable");
      toast.error(toFriendlyMessage(e, "push_disable"));
      await refresh();
    }
  }, [refresh]);

  return { state, supported, enable, disable, refresh };
}
