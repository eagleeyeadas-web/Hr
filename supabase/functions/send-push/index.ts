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

    let recordData: any = null;
    let isTest = false;

    // Check if it's a direct test request or direct subscription send
    if (payload.type === "test" || !!payload.subscription_id) {
      isTest = true;
      recordData = {
        title: payload.title || "PHONE TEST",
        message: payload.message || "Testing notification directly",
        type: "test",
        subscription_id: payload.subscription_id || null,
        user_id: payload.user_id || null,
        employee_phone: payload.employee_phone || null,
      };
    } else {
      // Normal database webhook event flow
      const { record, type, table } = payload;

      if (type !== "INSERT" || table !== "notifications") {
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

      if (!record) {
        console.error("❌ Webhook did not contain a notification record.");
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

      recordData = record;
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
      subscription_id,
    } = recordData;

    console.log("====================================");
    console.log("📩 NOTIFICATION RECEIVED");
    if (user_id) {
      console.log(`[HR PUSH] Target HR User ID: ${user_id}`);
    } else if (employee_phone) {
      console.log(`[EMPLOYEE PUSH] Target Employee Phone: ${employee_phone}`);
    } else {
      console.log("[PUSH] Target Subscription ID:", subscription_id);
    }
    console.log("HR User ID:", user_id);
    console.log("Employee Phone:", employee_phone);
    console.log("Title:", title);
    console.log("Message:", message);
    console.log("Notification Type:", notificationType);
    console.log("Related ID:", related_id);
    if (isTest) {
      console.log("Test Mode: YES");
      console.log("Target Subscription ID:", subscription_id);
    }
    console.log("====================================");

    // ---------------------------------------------------
    // CHECK RECIPIENT
    // ---------------------------------------------------

    if (!user_id && !employee_phone && !subscription_id) {
      console.error(
        "❌ No user_id, employee_phone, or subscription_id found."
      );

      return new Response(
        JSON.stringify({
          success: false,
          error: "No notification recipient or subscription ID found",
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
      user_id: string | null;
      employee_phone: string | null;
    }> = [];

    if (isTest && subscription_id) {
      console.log(`🔎 Searching push subscription by ID: ${subscription_id}`);
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("id, subscription, user_id, employee_phone")
        .eq("id", subscription_id);

      if (error) {
        console.error("❌ Failed to find subscription by ID:", error);
        throw error;
      }
      subscriptions = data || [];
    } else if (user_id) {
      // [PUSH SUBSCRIPTION DEBUG]
      console.log("[PUSH SUBSCRIPTION DEBUG]");
      console.log("subscription user_id (HR):", user_id);
      console.log("subscription employee_phone: null (HR notification)");
      console.log("🔎 Searching HR push subscription by user_id...");

      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("id, subscription, user_id, employee_phone")
        .eq("user_id", user_id);

      if (error) {
        console.error("❌ Failed to find HR subscription:", error);
        throw error;
      }
      subscriptions = data || [];
      console.log("[PUSH SUBSCRIPTION DEBUG] subscription found:", subscriptions.length > 0);
      console.log("[PUSH SUBSCRIPTION DEBUG] matching rows:", subscriptions.length);
    } else if (employee_phone) {
      // [PUSH SUBSCRIPTION DEBUG]
      console.log("[PUSH SUBSCRIPTION DEBUG]");
      console.log("subscription user_id: null (employee notification)");
      console.log("subscription employee_phone:", employee_phone);
      console.log("🔎 Searching employee push subscription by phone...");

      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("id, subscription, user_id, employee_phone")
        .eq("employee_phone", employee_phone);

      if (error) {
        console.error("❌ Failed to find employee subscription:", error);
        throw error;
      }
      subscriptions = data || [];
      console.log("[PUSH SUBSCRIPTION DEBUG] subscription found:", subscriptions.length > 0);
      console.log("[PUSH SUBSCRIPTION DEBUG] matching rows:", subscriptions.length);
    }

    // ---------------------------------------------------
    // NO SUBSCRIPTION
    // ---------------------------------------------------

    if (subscriptions.length === 0) {
      // [PUSH SUBSCRIPTION DEBUG]
      console.log("[PUSH SUBSCRIPTION DEBUG] subscription found: false");
      console.error(
        `❌ No push subscription found for user_id=${user_id || 'n/a'} / employee_phone=${employee_phone || 'n/a'}.`
      );
      console.error(
        "ACTION REQUIRED: The HR user must log in and allow notifications to register a fresh push subscription."
      );

      return new Response(
        JSON.stringify({
          success: false,
          message: "No active push subscription found for recipient.",
          debug: {
            user_id: user_id || null,
            employee_phone: employee_phone || null,
            action_required: "HR user must re-register push subscription by logging in to the portal and allowing notifications."
          }
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

    if (employee_phone) {
      if (notificationType === "leave") {
        relativeUrl = "/employee/my-leave";
      } else if (notificationType === "permission") {
        relativeUrl = "/employee/my-permissions";
      } else {
        relativeUrl = "/employee/dashboard";
      }
    } else {
      if (notificationType === "leave") {
        relativeUrl = "/hr/leave";
      } else if (notificationType === "permission") {
        relativeUrl = "/hr/permissions";
      } else {
        relativeUrl = "/hr/dashboard";
      }
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
    let testResult: any = null;

    // Helper to extract hostname and short identifier for endpoint logging safely
    const getEndpointInfo = (endpointUrl: string) => {
      try {
        const url = new URL(endpointUrl);
        const lastPart = endpointUrl.slice(-15);
        return {
          hostname: url.hostname,
          shortId: `...${lastPart}`
        };
      } catch {
        return {
          hostname: "unknown",
          shortId: "invalid-url"
        };
      }
    };

    // VAPID keys verification comparison
    const FRONTEND_VAPID_PUBLIC_KEY = "BMJ8X5Yt-TnjJy9MT0n4snoPaSWwb4GVRaEmkqF0XgICV-89IVU0sAxZXY_vPtbv0Z74YWgrVt7tSEuMtX37A1Y";
    const serverPublicKeyTrimmed = VAPID_PUBLIC_KEY.trim();
    const frontendPublicKeyTrimmed = FRONTEND_VAPID_PUBLIC_KEY.trim();
    const vapidKeyMatches = serverPublicKeyTrimmed === frontendPublicKeyTrimmed;

    console.log("------------------------------------");
    console.log("🔑 VAPID KEYS COMPARISON");
    console.log(`Server VAPID Public Key length: ${serverPublicKeyTrimmed.length}`);
    console.log(`Frontend VAPID Public Key length: ${frontendPublicKeyTrimmed.length}`);
    console.log(`VAPID Public Keys match exactly: ${vapidKeyMatches ? "YES" : "NO"}`);
    if (!vapidKeyMatches) {
      console.warn("⚠️ WARNING: Server VAPID Public Key does NOT match the hardcoded Frontend VAPID Public Key!");
      console.log(`Server key starts with: "${serverPublicKeyTrimmed.slice(0, 10)}..."`);
      console.log(`Frontend key starts with: "${frontendPublicKeyTrimmed.slice(0, 10)}..."`);
    }
    console.log("------------------------------------");

    for (const sub of subscriptions) {
      const { hostname, shortId } = getEndpointInfo(sub.subscription?.endpoint || "");
      const recipient = sub.user_id ? `User ID: ${sub.user_id}` : `Employee Phone: ${sub.employee_phone}`;
      
      console.log("------------------------------------");
      console.log(`📱 SENDING TO SUBSCRIPTION: ${sub.id}`);
      console.log(`   Recipient: ${recipient}`);
      console.log(`   Endpoint Hostname: ${hostname}`);
      console.log(`   Endpoint Short ID: ${shortId}`);

      let sendSuccess = false;
      let statusCode = 200;
      let responseBody = "";
      let deleted = false;

      try {
        await webpush.sendNotification(
          sub.subscription,
          notificationPayload
        );

        sentCount++;
        sendSuccess = true;
        console.log(`✅ SUCCESS: Notification delivered successfully to subscription ${sub.id}.`);
        // [PUSH RESULT]
        console.log("[PUSH RESULT]");
        console.log("success: true");
        console.log(`subscription_id: ${sub.id}`);
        console.log(`recipient: ${recipient}`);
        console.log(`delivery_type: ${sub.user_id ? "HR" : "EMPLOYEE"}`);
      } catch (error: any) {
        failedCount++;
        statusCode = error?.statusCode || 500;
        responseBody = error?.body || error?.message || String(error);

        console.error(`❌ FAILURE: Notification failed for subscription ${sub.id}.`);
        console.error(`   Status Code: ${statusCode}`);
        console.error(`   Response Body: ${responseBody}`);
        // [PUSH RESULT]
        console.log("[PUSH RESULT]");
        console.log("success: false");
        console.log(`subscription_id: ${sub.id}`);
        console.log(`recipient: ${recipient}`);
        console.log(`delivery_type: ${sub.user_id ? "HR" : "EMPLOYEE"}`);
        console.log(`status_code: ${statusCode}`);
        console.log(`error: ${responseBody}`);

        // Remove expired subscription
        if (statusCode === 404 || statusCode === 410) {
          console.log(`🗑️ Removing expired subscription ${sub.id} from database...`);
          const { error: deleteError } = await supabase
            .from("push_subscriptions")
            .delete()
            .eq("id", sub.id);

          if (deleteError) {
            console.error(`❌ Failed to delete expired subscription ${sub.id}:`, deleteError);
          } else {
            console.log(`✅ Expired subscription ${sub.id} deleted. HR user must re-register.`);
            deleted = true;
          }
        }
      }

      // Record test details if this is the target subscription ID in test mode
      if (isTest && sub.id === subscription_id) {
        testResult = {
          success: sendSuccess,
          subscription_id: sub.id,
          status: statusCode,
          message: sendSuccess ? "Push sent successfully" : undefined,
          error: !sendSuccess ? responseBody : undefined,
          diagnostics: {
            deleted,
            hostname,
            shortId,
            recipient,
            vapidKeyMatches
          }
        };
      }
    }

    // ---------------------------------------------------
    // RESULT
    // ---------------------------------------------------

    console.log("====================================");
    console.log("🏁 PUSH PROCESS FINISHED");
    console.log(`📤 Sent: ${sentCount}`);
    console.log(`❌ Failed: ${failedCount}`);
    console.log(`📱 Total subscriptions: ${subscriptions.length}`);
    console.log("====================================");

    if (isTest && subscription_id) {
      if (!testResult) {
        return new Response(
          JSON.stringify({
            success: false,
            subscription_id: subscription_id,
            error: "Subscription ID was found in database but not processed.",
            status: 500
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

      return new Response(
        JSON.stringify(testResult),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent_count: sentCount,
        failed_count: failedCount,
        total_subscriptions: subscriptions.length,
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