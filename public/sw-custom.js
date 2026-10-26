// ═════════════════════════════════════════════════════════════════════════════
// Custom Service Worker Extension for What's Next 24/7 Web Push & Notifications
// ═════════════════════════════════════════════════════════════════════════════

// 1. Notification Click: Focus open app window and navigate to data.url, or open new window
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl)
          }
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})

// 2. Push Event: Wake locked device and display banner with app logo & details
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
      data: { url: payload.url || (payload.data && payload.data.url) || '/' },
      vibrate: payload.vibrate || [150, 80, 150],
    }
    event.waitUntil(self.registration.showNotification(title, options))
  } catch (_err) {
    event.waitUntil(
      self.registration.showNotification("What's Next", {
        body: event.data.text(),
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: '/' },
      })
    )
  }
})

// 3. Push Subscription Change: Re-subscribe if the push service refreshed credentials
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .getSubscription()
      .then((existingSub) => {
        if (!existingSub) return null
        return self.registration.pushManager.subscribe(existingSub.options)
      })
      .then((newSub) => {
        if (!newSub) return
        return self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((c) => c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED', subscription: newSub.toJSON() }))
        })
      })
      .catch((err) => console.warn('Failed to renew push subscription:', err))
  )
})

// 4. Message Event: Direct dispatch bridge from frontend
self.addEventListener('message', (event) => {
  if (!event.data) return

  if (event.data.type === 'SHOW_NOTIFICATION' && event.data.payload) {
    const p = event.data.payload
    self.registration.showNotification(p.title, {
      body: p.body,
      icon: p.icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: p.tag || 'whats-next-alert',
      data: p.data || { url: '/' },
      vibrate: p.vibrate || [150, 80, 150],
    })
  }
})
