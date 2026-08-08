import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "npm:web-push"

// Configure VAPID details (environment variables in Supabase Secrets)
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || ""
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || ""
const VAPID_EMAIL = Deno.env.get("VAPID_EMAIL") || "mailto:admin@company.com"

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_EMAIL,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  )
}

serve(async (req) => {
  // CORS support
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  try {
    const payload = await req.json()
    const { record, type, table } = payload

    // Only process inserts to notifications table
    if (type !== 'INSERT' || table !== 'notifications') {
      return new Response(JSON.stringify({ message: "Skipped. Event is not a notification insert." }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    }

    const { user_id, employee_phone, title, message, type: notifType, related_id } = record

    // Initialize Supabase Client with Admin privilege key (Service Role)
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Query active push subscriptions for recipient (user_id for HR, employee_phone for Employees)
    let query = supabase.from("push_subscriptions").select("subscription")
    if (employee_phone) {
      query = query.eq("employee_phone", employee_phone)
    } else if (user_id) {
      query = query.eq("user_id", user_id)
    } else {
      return new Response(JSON.stringify({ message: "Skipped. No recipient specified." }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    }

    const { data: subscriptions, error: fetchErr } = await query
    if (fetchErr) throw fetchErr

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "No active push subscriptions found." }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    }

    // Determine target redirect url based on notification context
    const relativeUrl = notifType === 'leave' ? '/hr/leave' : notifType === 'permission' ? '/hr/permissions' : '/'
    const redirectUrl = `http://localhost:5173${relativeUrl}`

    const notificationPayload = JSON.stringify({
      title,
      body: message,
      icon: '/logo.png',
      data: { url: redirectUrl }
    })

    console.log(`Delivering push payload to ${subscriptions.length} subscription endpoints...`)

    const sendPromises = subscriptions.map((sub) => {
      return webpush.sendNotification(sub.subscription, notificationPayload)
        .catch(async (err) => {
          console.error("Push dispatch failed:", err.message)
          // Clean up subscription from DB if expired/invalid (404/410)
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("subscription", sub.subscription)
          }
        })
    })

    await Promise.all(sendPromises)

    return new Response(JSON.stringify({ success: true, sent_count: subscriptions.length }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (err) {
    console.error("Fatal send-push error:", err)
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
