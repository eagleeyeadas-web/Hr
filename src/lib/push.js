import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = 'BD8WYifkjqnoTLo1NEulB4ixg8cdACPmj1zq6eH9npA7MRy2WlCjB0tK7NoTtYnSWywuO9fvvLBU8UYZX12WRkA'

// Helper to convert base64 to Uint8Array for VAPID key registration
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export async function registerPushNotifications(userId, employeePhone) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications are not supported by this browser.')
    return
  }

  try {
    // 1. Register service worker
    const registration = await navigator.serviceWorker.register('/sw.js')
    
    // 2. Request browser permission
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      console.warn('Notification permission denied by user.')
      return
    }

    // 3. Subscribe to push manager
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })

    // 4. Save subscription to Supabase push_subscriptions table
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: userId || null,
      employee_phone: employeePhone || null,
      subscription: subscription,
    }, {
      onConflict: userId ? 'user_id, subscription' : 'employee_phone, subscription',
    })

    if (error) throw error
    console.log('Successfully registered to Web Push notifications!')
  } catch (err) {
    console.error('Failed to configure push notification subscription:', err)
  }
}
