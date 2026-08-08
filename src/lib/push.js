import { supabase } from "./supabase";

const VAPID_PUBLIC_KEY =
  "BMJ8X5Yt-TnjJy9MT0n4snoPaSWwb4GVRaEmkqF0XgICV-89IVU0sAxZXY_vPtbv0Z74YWgrVt7tSEuMtX37A1Y";

// Convert VAPID public key to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat(
    (4 - (base64String.length % 4)) % 4
  );

  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);

  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export async function registerPushNotifications(
  userId = null,
  employeePhone = null
) {
  // =============================================
  // [AUTH DEBUG]
  // =============================================
  console.log("[AUTH DEBUG]");
  console.log("current auth user id:", userId || "(none — employee session)");
  console.log(
    "current user role:",
    userId ? "hr/admin" : "employee"
  );

  // Check browser support
  if (!("serviceWorker" in navigator)) {
    console.warn("Service Worker is not supported.");
    return;
  }

  if (!("PushManager" in window)) {
    console.warn("Web Push is not supported.");
    return;
  }

  if (!("Notification" in window)) {
    console.warn("Notifications are not supported.");
    return;
  }

  try {
    // 1. Register Service Worker
    const registration =
      await navigator.serviceWorker.register("/sw.js");

    console.log("✅ Service Worker registered");

    // Wait until Service Worker is ready
    await navigator.serviceWorker.ready;

    // 2. Request notification permission
    let permission = Notification.permission;

    if (permission === "default") {
      permission =
        await Notification.requestPermission();
    }

    if (permission !== "granted") {
      console.warn(
        "❌ Notification permission was not granted."
      );
      return;
    }

    console.log("✅ Notification permission granted");

    // 3. Check if device already has a subscription
    let subscription =
      await registration.pushManager.getSubscription();

    // 4. Create push subscription if needed
    if (!subscription) {
      subscription =
        await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey:
            urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });

      console.log("✅ New push subscription created");
    } else {
      console.log("✅ Existing push subscription found");
    }

    // Convert subscription to JSON
    const subscriptionData =
      subscription.toJSON();

    // =============================================
    // [PUSH SUBSCRIPTION DEBUG]
    // =============================================
    console.log("[PUSH SUBSCRIPTION DEBUG]");
    console.log(
      "subscription endpoint hostname:",
      new URL(subscriptionData.endpoint).hostname
    );
    console.log(
      "subscription user_id (HR):",
      userId || "null (employee session — expected)"
    );
    console.log(
      "subscription employee_phone:",
      employeePhone || "null (HR session — expected)"
    );

    // 5. Make sure recipient exists
    if (!userId && !employeePhone) {
      console.error(
        "❌ No HR user ID or employee phone provided."
      );
      return;
    }

    // 6. Save subscription in Supabase using upsert
    // onConflict: endpoint ensures no duplicate rows per device
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userId || null,
          employee_phone: employeePhone || null,
          subscription: subscriptionData,
          endpoint: subscriptionData.endpoint,
        },
        {
          onConflict: "endpoint",
        }
      );

    if (error) {
      console.error(
        "❌ PUSH DATABASE ERROR:",
        error
      );
      return;
    }

    console.log("[PUSH SUBSCRIPTION DEBUG]");
    console.log("subscription found: true (saved/updated successfully)");
    console.log(
      "✅ Push subscription saved successfully!"
    );

  } catch (error) {
    console.error(
      "❌ Failed to configure push notifications:",
      error
    );
  }
}