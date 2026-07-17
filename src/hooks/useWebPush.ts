import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { toFriendlyMessage, logRawError } from "@/lib/settingsSecurityErrors";

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

type SerializedPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

function serializeSubscription(browserSub: PushSubscription): SerializedPushSubscription {
  const json = browserSub.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  const endpoint = json.endpoint ?? browserSub.endpoint;
  const p256dh = json.keys?.p256dh ?? bufToBase64(browserSub.getKey("p256dh"));
  const auth = json.keys?.auth ?? bufToBase64(browserSub.getKey("auth"));
  if (!endpoint || !p256dh || !auth) throw new Error("Browser returned an incomplete push subscription");
  return { endpoint, p256dh, auth };
}

async function getAuthenticatedUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error("Sign in again to enable push notifications");
  return data.user.id;
}

async function loadVapidPublicKey(): Promise<string> {
  // Lovable's gateway currently requires the normal Supabase auth headers
  // even for functions deployed with verify_jwt=false. functions.invoke adds
  // those headers; a bare fetch can be rejected before the function runs.
  const { data, error } = await supabase.functions.invoke("web-push-public-key", {
    body: {},
  });
  if (error) throw error;
  const publicKey = (data as { publicKey?: string } | null)?.publicKey;
  if (!publicKey) throw new Error("Push is not configured");
  return publicKey;
}

async function persistSubscription(browserSub: PushSubscription, userId: string) {
  const { endpoint, p256dh, auth } = serializeSubscription(browserSub);
  const { error: saveError } = await supabase.rpc("save_push_subscription", {
    _endpoint: endpoint,
    _p256dh: p256dh,
    _auth: auth,
    _user_agent: navigator.userAgent.slice(0, 200),
  });
  if (saveError) throw saveError;

  const { error: preferenceError } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: userId, push_enabled: true, updated_at: new Date().toISOString() });
  if (preferenceError) throw preferenceError;

  // Do not show an optimistic "Enabled" state unless the server can read the
  // exact subscription back for this user.
  const { data: persisted, error: verifyError } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (verifyError || !persisted) {
    throw verifyError ?? new Error("Push subscription could not be verified");
  }
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
      if (!sub) { setState("off"); return; }

      const userId = await getAuthenticatedUserId();
      const [{ data: persisted, error: subscriptionError }, { data: preference, error: preferenceError }] =
        await Promise.all([
          supabase
            .from("push_subscriptions")
            .select("id")
            .eq("user_id", userId)
            .eq("endpoint", sub.endpoint)
            .maybeSingle(),
          supabase
            .from("notification_preferences")
            .select("push_enabled")
            .eq("user_id", userId)
            .maybeSingle(),
        ]);
      if (subscriptionError || preferenceError) throw subscriptionError ?? preferenceError;
      setState(persisted && preference?.push_enabled ? "on" : "off");
    } catch (e) {
      logRawError(e, "push_refresh");
      setState("off");
    }
  }, [supported]);

  useEffect(() => {
    if (!supported) { setState("unsupported"); return; }
    navigator.serviceWorker.register("/sw.js").then(refresh).catch(() => setState("off"));
  }, [supported, refresh]);

  const enable = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    setState("loading");
    let browserSub: PushSubscription | null = null;
    let createdBrowserSub = false;
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        toast.error(perm === "denied"
          ? "Push permission denied. Enable notifications in your browser settings."
          : "Couldn't enable push notifications. Try again.");
        return false;
      }

      const userId = await getAuthenticatedUserId();
      const reg = await navigator.serviceWorker.ready;
      browserSub = await reg.pushManager.getSubscription();
      if (!browserSub) {
        const publicKey = await loadVapidPublicKey();
        browserSub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        createdBrowserSub = true;
      }

      await persistSubscription(browserSub, userId);
      setState("on");
      toast.success("Push notifications enabled");
      return true;
    } catch (e: unknown) {
      if (createdBrowserSub && browserSub) {
        try { await browserSub.unsubscribe(); } catch { /* noop */ }
      }
      logRawError(e, "push_enable");
      toast.error(toFriendlyMessage(e, "push_enable"));
      await refresh();
      return false;
    }
  }, [supported, refresh]);

  const disable = useCallback(async (): Promise<boolean> => {
    setState("loading");
    try {
      const userId = await getAuthenticatedUserId();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();

      const { error: deleteError } = await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", userId);
      if (deleteError) throw deleteError;
      const { error: preferenceError } = await supabase
        .from("notification_preferences")
        .upsert({ user_id: userId, push_enabled: false, updated_at: new Date().toISOString() });
      if (preferenceError) throw preferenceError;

      if (sub) await sub.unsubscribe();
      setState("off");
      toast.success("Push notifications disabled");
      return true;
    } catch (e: unknown) {
      logRawError(e, "push_disable");
      toast.error(toFriendlyMessage(e, "push_disable"));
      await refresh();
      return false;
    }
  }, [refresh]);

  return { state, supported, enable, disable, refresh };
}
