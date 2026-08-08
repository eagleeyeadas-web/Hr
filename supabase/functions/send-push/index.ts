import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push";

// =====================================================
// CONFIGURATION
// =====================================================

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";

const VAPID_EMAIL =
  Deno.env.get("VAPID_EMAIL") || "mailto:admin@company.com";

// LIVE HR WEBSITE
const APP_URL = "https://hr-portal-login.vercel.app";

// =====================================================
// VAPID CONFIGURATION
// =====================================================

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("❌ VAPID keys are missing.");
} else {
  webpush.setVapidDetails(
    VAPID_EMAIL,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );

  console.log("✅ VAPID configuration loaded.");
}

// =====================================================
// SUPABASE ADMIN CLIENT
// =====================================================

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") || "";

const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

// =====================================================
// CORS
// =====================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};

// =====================================================
// EDGE FUNCTION
// =====================================================

serve(async (req) => {
  // ---------------------------------------------------
  // OPTIONS / CORS
  // ---------------------------------------------------

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    console.log("====================================");
    console.log("🔔 SEND-PUSH FUNCTION STARTED");
    console.log("====================================");

    // ---------------------------------------------------
    // CHECK VAPID CONFIGURATION
    // ---------------------------------------------------

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.error("❌ VAPID keys are not configured.");

      return new Response(
        JSON.stringify({
          success: false,
          error: "VAPID keys are missing",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // ---------------------------------------------------
    // READ WEBHOOK PAYLOAD
    // ---------------------------------------------------

    const payload = await req.json();

    console.log("📦 Webhook payload:");
    console.log(JSON.stringify(payload, null, 2));

    const { record, type, table } = payload;

    // ---------------------------------------------------
    // CHECK EVENT
    // ---------------------------------------------------

    if (
      type !== "INSERT" ||
      table !== "notifications"
    ) {
      console.log("ℹ️ Ignoring unrelated database event.");

      return new Response(
        JSON.stringify({
          success: true,
          message: "Event ignored",
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // ---------------------------------------------------
    // CHECK RECORD
    // ---------------------------------------------------

    if (!record) {
      console.error(
        "❌ Webhook did not contain a notification record."
      );

      return new Response(
        JSON.stringify({
          success: false,
          error: "Notification record missing",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // ---------------------------------------------------
    // GET NOTIFICATION DATA
    // ---------------------------------------------------

    const {
      user_id,
      employee_phone,
      title,
      message,
      type: notificationType,
      related_id,
    } = record;

    console.log("====================================");
    console.log("📩 NOTIFICATION RECEIVED");
    console.log("HR User ID:", user_id);
    console.log("Employee Phone:", employee_phone);
    console.log("Title:", title);
    console.log("Message:", message);
    console.log("Notification Type:", notificationType);
    console.log("Related ID:", related_id);
    console.log("====================================");

    // ---------------------------------------------------
    // CHECK RECIPIENT
    // ---------------------------------------------------

    if (!user_id && !employee_phone) {
      console.error(
        "❌ No user_id or employee_phone found."
      );

      return new Response(
        JSON.stringify({
          success: false,
          error: "No notification recipient found",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // ---------------------------------------------------
    // FIND PUSH SUBSCRIPTIONS
    // ---------------------------------------------------

    let subscriptions: Array<{
      id: string;
      subscription: any;
    }> = [];

    // ---------------------------------------------------
    // HR NOTIFICATION
    // ---------------------------------------------------

    if (user_id) {
      console.log(
        "🔎 Searching HR push subscription..."
      );

      console.log(
        "HR user_id:",
        user_id
      );

      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("id, subscription")
        .eq("user_id", user_id);

      if (error) {
        console.error(
          "❌ Failed to find HR subscription:",
          error
        );

        throw error;
      }

      subscriptions = data || [];
    }

    // ---------------------------------------------------
    // EMPLOYEE NOTIFICATION
    // ---------------------------------------------------

    else if (employee_phone) {
      console.log(
        "🔎 Searching employee push subscription..."
      );

      console.log(
        "Employee phone:",
        employee_phone
      );

      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("id, subscription")
        .eq(
          "employee_phone",
          employee_phone
        );

      if (error) {
        console.error(
          "❌ Failed to find employee subscription:",
          error
        );

        throw error;
      }

      subscriptions = data || [];
    }

    // ---------------------------------------------------
    // NO SUBSCRIPTION
    // ---------------------------------------------------

    if (subscriptions.length === 0) {
      console.error(
        "❌ No push subscription found."
      );

      return new Response(
        JSON.stringify({
          success: false,
          message:
            "No active push subscription found for recipient.",
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log(
      `✅ Found ${subscriptions.length} push subscription(s).`
    );

    // ---------------------------------------------------
    // DETERMINE NOTIFICATION CLICK URL
    // ---------------------------------------------------

    let relativeUrl = "/";

    if (notificationType === "leave") {
      relativeUrl = "/hr/leave";
    }

    if (notificationType === "permission") {
      relativeUrl = "/hr/permissions";
    }

    const redirectUrl =
      `${APP_URL}${relativeUrl}`;

    console.log(
      "🌐 Notification click URL:",
      redirectUrl
    );

    // ---------------------------------------------------
    // CREATE PUSH PAYLOAD
    // ---------------------------------------------------

    const notificationPayload =
      JSON.stringify({
        title:
          title || "HR Portal",

        body:
          message ||
          "You have a new notification.",

        icon:
          `${APP_URL}/favicon.svg`,

        badge:
          `${APP_URL}/favicon.svg`,

        data: {
          url: redirectUrl,
          related_id:
            related_id || null,
          type:
            notificationType || null,
        },
      });

    // ---------------------------------------------------
    // SEND PUSH NOTIFICATIONS
    // ---------------------------------------------------

    let sentCount = 0;
    let failedCount = 0;

    console.log(
      "📤 Sending push notification..."
    );

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          sub.subscription,
          notificationPayload
        );

        sentCount++;

        console.log(
          "✅ Push notification sent successfully."
        );
      } catch (error: any) {
        failedCount++;

        console.error(
          "❌ Push notification failed:",
          error?.message || error
        );

        console.error(
          "Status code:",
          error?.statusCode
        );

        // ------------------------------------------------
        // REMOVE EXPIRED SUBSCRIPTION
        // ------------------------------------------------

        if (
          error?.statusCode === 404 ||
          error?.statusCode === 410
        ) {
          console.log(
            "🗑️ Removing expired subscription:",
            sub.id
          );

          const { error: deleteError } =
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("id", sub.id);

          if (deleteError) {
            console.error(
              "❌ Failed to delete expired subscription:",
              deleteError
            );
          } else {
            console.log(
              "✅ Expired subscription removed."
            );
          }
        }
      }
    }

    // ---------------------------------------------------
    // RESULT
    // ---------------------------------------------------

    console.log("====================================");
    console.log("🏁 PUSH PROCESS FINISHED");
    console.log(
      `📤 Sent: ${sentCount}`
    );
    console.log(
      `❌ Failed: ${failedCount}`
    );
    console.log(
      `📱 Total subscriptions: ${subscriptions.length}`
    );
    console.log("====================================");

    return new Response(
      JSON.stringify({
        success: true,
        sent_count: sentCount,
        failed_count: failedCount,
        total_subscriptions:
          subscriptions.length,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );

  } catch (error: any) {
    // ---------------------------------------------------
    // FATAL ERROR
    // ---------------------------------------------------

    console.error("====================================");
    console.error("🔥 FATAL SEND-PUSH ERROR");
    console.error(error);
    console.error("====================================");

    return new Response(
      JSON.stringify({
        success: false,
        error:
          error?.message ||
          "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});