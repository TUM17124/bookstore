self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Intentionally empty.
  // Next.js/Nginx handles normal requests.
});

self.addEventListener("push", (event) => {
  let data = {
    title: "PlugYard",
    body: "A note for your shelf is waiting.",
    url: "/",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "",
    kind: "",
  };

  if (event.data) {
    try {
      const json = event.data.json();
      data = {
        ...data,
        ...json,
      };
    } catch (error) {
      try {
        data.body = event.data.text();
      } catch (textError) {
        // Keep the default notification body.
      }
    }
  }

  const title = data.title || "PlugYard";
  const tag = data.tag || data.kind || "plugyard";

  const options = {
    body: data.body || "A note for your shelf is waiting.",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    tag,
    renotify: Boolean(tag),
    data: {
      url: data.url || "/",
      kind: data.kind || "",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(url);
        }

        return undefined;
      })
  );
});

self.addEventListener("notificationclose", () => {
  // Reserved for future notification analytics.
});
