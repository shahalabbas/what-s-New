// Custom service worker extension for What's Next notification handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl)
          }
          return client.focus()
        }
      }
      // If no window is open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})

// Optional background push handler for server-triggered Web Push (VAPID)
self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    const payload = event.data.json()
    const title = payload.title || "What's Next"
    const options = {
      body: payload.body || 'New campus update',
      icon: payload.icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.tag || 'whats-next-alert',
      data: payload.data || { url: '/' },
      vibrate: [200, 100, 200],
    }
    event.waitUntil(self.registration.showNotification(title, options))
  } catch (err) {
    event.waitUntil(
      self.registration.showNotification("What's Next", {
        body: event.data.text(),
        icon: '/icons/icon-192.png',
        data: { url: '/' },
      })
    )
  }
})
