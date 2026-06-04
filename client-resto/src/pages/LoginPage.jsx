import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

export default function LoginPage() {
  const { session, loading, signIn } = useAuth()
  const { theme, toggle } = useTheme()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr]           = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)' }}>
      <span className="spinner" style={{ width: 24, height: 24 }} />
    </div>
  )

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setErr(null)
    if (!email.trim() || !password) {
      setErr('Email and password are required')
      return
    }
    setSubmitting(true)
    const { error } = await signIn(email.trim().toLowerCase(), password)
    if (error) setErr(error.message)
    setSubmitting(false)
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '2rem',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '2rem', fontWeight: 800, fontStyle: 'italic',
            color: 'var(--accent)', letterSpacing: -1,
          }}>
            Rufesto
          </div>
          <div style={{
            fontSize: '0.78rem', fontWeight: 600, color: 'var(--t3)',
            marginTop: 4, letterSpacing: 1.5, textTransform: 'uppercase',
          }}>
            For Business
          </div>
        </div>

        {/* Login card */}
        <form onSubmit={handleSubmit} style={{
          background: 'var(--s2)', borderRadius: 16,
          border: '1px solid var(--border)',
          padding: '2rem 1.75rem',
        }}>
          <h2 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '1.15rem', fontWeight: 700, marginBottom: '1.5rem',
            textAlign: 'center',
          }}>
            Sign in to your restaurant
          </h2>

          <label style={{ display: 'block', marginBottom: '1rem' }}>
            <span className="label">Email</span>
            <input
              type="email"
              className="input"
              placeholder="admin@restaurant.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />
          </label>

          <label style={{ display: 'block', marginBottom: '1.25rem' }}>
            <span className="label">Password</span>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>

          {err && (
            <div style={{
              padding: '0.55rem 0.75rem', borderRadius: 8, marginBottom: '1rem',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              color: 'var(--red)', fontSize: '0.8rem', fontWeight: 500,
            }}>
              {err}
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={submitting} style={{
            width: '100%', padding: '0.65rem', fontSize: '0.88rem',
          }}>
            {submitting ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Sign In'}
          </button>
        </form>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button onClick={toggle} style={{
            background: 'none', border: 'none', color: 'var(--t3)',
            fontSize: '0.75rem', cursor: 'pointer',
          }}>
            {theme === 'dark' ? '☀ Light mode' : '🌙 Dark mode'}
          </button>
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.72rem', color: 'var(--t3)' }}>
          Restaurant accounts are created by Rufesto.
          <br />Contact us to get started.
        </p>
      </div>
    </div>
  )
}
