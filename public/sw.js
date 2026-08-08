// Service Worker for HR Portal Web Push Notifications

self.addEventListener('push', function (event) {
  if (event.data) {
    try {
      const payload = event.data.json()
      const options = {
        body: payload.body,
        icon: payload.icon || '/logo.png',
        badge: '/badge.png',
        vibrate: [100, 50, 100],
        data: payload.data || {},
      }
      event.waitUntil(
        self.registration.showNotification(payload.title, options)
      )
    } catch (e) {
      console.error('Error handling push event:', e)
    }
  }
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  
  // Navigate to appropriate route (e.g. LeaveRequests, Notifications, etc.)
  const urlToOpen = event.notification.data?.url || '/'
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      // If a tab is already open with the URL, focus it
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i]
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus()
        }
      }
      // Otherwise open a new window/tab
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen)
      }
    })
  )
})
