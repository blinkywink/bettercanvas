import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

type AuthStatus = { enabled?: boolean; authenticated?: boolean; username?: string | null }

function AuthGate() {
  const [status, setStatus] = React.useState<'checking' | 'login' | 'ready'>('checking')
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const check = React.useCallback(async () => {
    try {
      const r = await fetch('/api/auth/status', { credentials: 'include' })
      if (!r.ok) {
        setStatus('login')
        return
      }
      const d = (await r.json()) as AuthStatus
      if (d.enabled === true && d.authenticated !== true) {
        setStatus('login')
      } else {
        setStatus('ready')
      }
    } catch {
      setStatus('login')
    }
  }, [])

  React.useEffect(() => {
    check()
  }, [check])

  async function submit(path: '/api/auth/login' | '/api/auth/register') {
    setBusy(true)
    setError('')
    try {
      const r = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: username.trim(), password }),
      })
      if (!r.ok) {
        let j: any = {}
        try {
          j = await r.json()
        } catch {
          // ignore
        }
        setError(j.error || 'Authentication failed')
        setBusy(false)
        return
      }
      await check()
    } catch {
      setError('Network error')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'checking') {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Loading…</div>
  }

  if (status === 'login') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0c1226', color: '#e0f2fe' }}>
        <div style={{ width: 340, maxWidth: '92vw', border: '1px solid #1e3a5f', borderRadius: 12, padding: 20, background: '#1e293b' }}>
          <h2 style={{ margin: '0 0 12px 0', textAlign: 'center' }}>Better Calendar Tasks</h2>
          <label style={{ fontSize: 13 }}>Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            style={{ width: '100%', marginTop: 6, marginBottom: 10, padding: 10, borderRadius: 8, border: '1px solid #334155', background: '#0c1226', color: '#e0f2fe', boxSizing: 'border-box' }}
          />
          <label style={{ fontSize: 13 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{ width: '100%', marginTop: 6, marginBottom: 10, padding: 10, borderRadius: 8, border: '1px solid #334155', background: '#0c1226', color: '#e0f2fe', boxSizing: 'border-box' }}
          />
          <button
            disabled={busy}
            onClick={() => submit('/api/auth/login')}
            style={{ width: '100%', padding: 10, borderRadius: 8, border: 0, background: '#38bdf8', color: '#0c1226', fontWeight: 700, cursor: 'pointer' }}
          >
            {busy ? 'Please wait…' : 'Sign in'}
          </button>
          <button
            disabled={busy}
            onClick={() => submit('/api/auth/register')}
            style={{ width: '100%', padding: 10, borderRadius: 8, border: 0, marginTop: 8, background: '#334155', color: '#e0f2fe', fontWeight: 700, cursor: 'pointer' }}
          >
            Create account
          </button>
          {error ? <p style={{ color: '#f87171', fontSize: 13, marginTop: 10 }}>{error}</p> : null}
        </div>
      </div>
    )
  }

  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate />
  </React.StrictMode>,
)
