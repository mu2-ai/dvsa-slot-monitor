self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "DVSA Slot Monitor";
  const options = {
    body: data.body || "Check your dashboard for available slots.",
    icon: data.icon || "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [200, 100, 200],
    tag: "dvsa-slot-alert",
    renotify: true,
    requireInteraction: true,
    actions: [
      { action: "book", title: "Book Now" },
      { action: "view", title: "View Dashboard" }
    ],
    data: { url: data.url || "/" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.action === "book"
    ? "https://www.gov.uk/book-driving-test"
    : (event.notification.data?.url || "/");
  event.waitUntil(clients.openWindow(url));
});
