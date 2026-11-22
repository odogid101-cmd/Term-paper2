/* Monkey Scout service worker — Web Push notifications */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {
    title: "Monkey Scout",
    body: "You have a new update.",
    url: "/dashboard.html",
    tag: "monkey-scout",
    icon: "https://i.postimg.cc/3xqH7Z6F/20261110-205017.png",
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch (e) {
    try {
      data.body = event.data ? event.data.text() : data.body;
    } catch (_) {}
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Monkey Scout", {
      body: data.body || "",
      icon: data.icon,
      badge: data.icon,
      tag: data.tag || "monkey-scout",
      data: { url: data.url || "/dashboard.html" },
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard.html";
  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if (client.navigate) {
            try { await client.navigate(target); } catch (_) {}
          }
          return;
        }
      }
      if (clients.openWindow) {
        await clients.openWindow(target);
      }
    })()
  );
});
