import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import './index.css'

// Immediate auto-updating service worker registration
const updateSW = registerSW({
  immediate: true,
  onRegistered(reg) {
    if (reg) {
      // Check for bundle updates on visibility and focus
      const checkUpdate = () => reg.update().catch(() => {})
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkUpdate()
      })
      window.addEventListener('focus', checkUpdate)
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
