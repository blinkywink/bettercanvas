import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

async function requireAuthIfNeeded(): Promise<boolean> {
  try {
    const r = await fetch('/api/auth/status', { credentials: 'include' })
    if (!r.ok) {
      if (window.location.pathname !== '/bct-sign-in') {
        window.location.replace('/bct-sign-in')
        return false
      }
      return true
    }
    const d = (await r.json()) as { enabled?: boolean; authenticated?: boolean }
    if (d.enabled === true && d.authenticated === false) {
      window.location.replace('/bct-sign-in')
      return false
    }
  } catch {
    if (window.location.pathname !== '/bct-sign-in') {
      window.location.replace('/bct-sign-in')
      return false
    }
  }
  return true
}

requireAuthIfNeeded().then((ok) => {
  if (!ok) return
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
