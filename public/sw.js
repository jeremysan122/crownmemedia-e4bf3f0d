/* CrownMe web-push service worker. Receives `push` events from the
 * `send-web-push` edge function and renders a notification with a
 * click-through to the deep link in `payload.link`. */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "CrownMe", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "CrownMe";
  const body = data.body || "";
  const url = (data.payload && data.payload.link) || data.link || "/";
  const tag = data.tag || data.id || undefined;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag,
      data: { url },
      vibrate: [50, 30, 50],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      // Focus an existing tab if possible.
      for (const client of clientsArr) {
        try {
          const u = new URL(client.url);
          if (u.origin === self.location.origin) {
            client.focus();
            client.postMessage({ type: "navigate", url: target });
            return;
          }
        } catch (_) { /* ignore */ }
      }
      return self.clients.openWindow(target);
    })
  );
});
