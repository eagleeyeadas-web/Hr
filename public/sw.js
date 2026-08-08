// ============================================================
// HR PORTAL - SERVICE WORKER
// Web Push Notifications
// ============================================================

console.log("🚀 HR Portal Service Worker loaded");

// ============================================================
// PUSH EVENT
// ============================================================

self.addEventListener("push", function (event) {
  console.log("🔔 Push event received");

  event.waitUntil(
    (async () => {
      try {
        let payload = {};

        // ----------------------------------------------------
        // Read push data
        // ----------------------------------------------------

        if (event.data) {
          const text = event.data.text();

          console.log("📩 Raw push data:", text);

          // Supabase Edge Function sends JSON.
          // Chrome DevTools Push sends plain text.
          try {
            payload = JSON.parse(text);

            console.log("✅ Push data parsed as JSON:", payload);
          } catch (jsonError) {
            console.log(
              "ℹ️ Push data is plain text. Using fallback."
            );

            payload = {
              title: "HR Portal",
              body: text,
              icon: "/favicon.svg",
              badge: "/favicon.svg",
              data: {
                url: "/"
              }
            };
          }
        } else {
          console.log("⚠️ Push event contains no data");

          payload = {
            title: "HR Portal",
            body: "You have a new notification.",
            icon: "/favicon.svg",
            badge: "/favicon.svg",
            data: {
              url: "/"
            }
          };
        }

        // ----------------------------------------------------
        // Notification settings
        // ----------------------------------------------------

        const title = payload.title || "HR Portal";

        const options = {
          body:
            payload.body ||
            "You have a new notification.",

          icon:
            payload.icon ||
            "/favicon.svg",

          badge:
            payload.badge ||
            "/favicon.svg",

          vibrate: [100, 50, 100],

          data:
            payload.data || {},

          requireInteraction: false
        };

        console.log(
          "📢 Showing notification:",
          title,
          options
        );

        // ----------------------------------------------------
        // Display notification
        // ----------------------------------------------------

        await self.registration.showNotification(
          title,
          options
        );

        console.log("✅ Notification displayed successfully");

      } catch (error) {
        console.error(
          "❌ Error handling push event:",
          error
        );
      }
    })()
  );
});


// ============================================================
// NOTIFICATION CLICK
// ============================================================

self.addEventListener("notificationclick", function (event) {
  console.log("🖱️ Notification clicked");

  event.notification.close();

  const notificationData =
    event.notification.data || {};

  const urlToOpen =
    notificationData.url || "/";

  console.log(
    "🌐 Opening notification URL:",
    urlToOpen
  );

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true
      })
      .then(function (windowClients) {

        // ----------------------------------------------------
        // Try to find an existing HR Portal tab
        // ----------------------------------------------------

        for (let i = 0; i < windowClients.length; i++) {

          const client = windowClients[i];

          if (
            client.url === urlToOpen &&
            "focus" in client
          ) {
            console.log(
              "🔎 Existing notification URL found"
            );

            return client.focus();
          }
        }

        // ----------------------------------------------------
        // If HR Portal is already open, navigate it
        // ----------------------------------------------------

        for (let i = 0; i < windowClients.length; i++) {

          const client = windowClients[i];

          if (
            client.url.startsWith(
              "https://hr-portal-login.vercel.app"
            ) &&
            "focus" in client
          ) {

            console.log(
              "🔄 Navigating existing HR Portal tab"
            );

            return client.focus().then(function () {

              if ("navigate" in client) {
                return client.navigate(urlToOpen);
              }

            });
          }
        }

        // ----------------------------------------------------
        // Otherwise open a new window
        // ----------------------------------------------------

        if (clients.openWindow) {

          console.log(
            "🆕 Opening new HR Portal window"
          );

          return clients.openWindow(urlToOpen);
        }

      })
  );
});


// ============================================================
// INSTALL
// ============================================================

self.addEventListener("install", function () {
  console.log(
    "📦 HR Portal Service Worker installed"
  );

  self.skipWaiting();
});


// ============================================================
// ACTIVATE
// ============================================================

self.addEventListener("activate", function (event) {
  console.log(
    "🚀 HR Portal Service Worker activated"
  );

  event.waitUntil(
    self.clients.claim()
  );
});