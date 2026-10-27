import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import './index.css'

// ── Cache Busting & Auto-Updating Engine ────────────────────────────────────
const APP_RELEASE_VERSION = 'release-2026-10-27-v6'

try {
  const activeVer = localStorage.getItem('whats_next_bundle_version')
  if (activeVer !== APP_RELEASE_VERSION) {
    localStorage.setItem('whats_next_bundle_version', APP_RELEASE_VERSION)
    if (typeof window !== 'undefined' && 'caches' in window) {
      caches.keys().then((names) => {
        for (const name of names) {
          caches.delete(name)
        }
      })
    }
  }
} catch {}

// Automatically reload page whenever a new service worker takes over
let hasRefreshed = false
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hasRefreshed) {
      hasRefreshed = true
      window.location.reload()
    }
  })
}

// Immediate auto-updating service worker registration
const updateSW = registerSW({
  immediate: true,
  onRegistered(reg) {
    if (reg) {
      // Actively check for bundle updates
      const checkUpdate = () => reg.update().catch(() => {})
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkUpdate()
      })
      window.addEventListener('focus', checkUpdate)
      setInterval(checkUpdate, 20000)
    }
  },
  onNeedRefresh() {
    updateSW(true)
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#1D1D1F',
            color: '#FFFFFF',
            borderRadius: '12px',
            fontSize: '14px',
            padding: '12px 16px',
          },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
)
