import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { App } from './App'
import './index.css'

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
