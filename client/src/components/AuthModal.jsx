import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function AuthModal({ onClose, onSuccess }) {
  const { signIn, signUp } = useAuth()
  const [tab,     setTab]     = useState('login')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPw,    setLoginPw]    = useState('')

  const [regName,  setRegName]  = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPw,    setRegPw]    = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regAge,   setRegAge]   = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(loginEmail, loginPw)
    setLoading(false)
    if (error) { setError(error.message); return }
    onSuccess?.()
    onClose?.()
  }

  async function handleRegister(e) {
    e.preventDefault()
    setError('')
    if (regPw.length < 8) { setError('Password must be at least 8 characters'); return }
    if (regAge && (Number(regAge) < 13 || Number(regAge) > 99)) { setError('Age must be between 13 and 99'); return }
    setLoading(true)
    const { error } = await signUp(regEmail, regPw, regName, regPhone || null, regAge || null)
    setLoading(false)
    if (error) { setError(error.message); return }
    onSuccess?.()
    onClose?.()
  }

  return (
    <div className="overlay center" onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={{ padding: '2rem' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--accent)', margin: '0 auto 0.75rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 24, height: 24, color: '#0c0a09' }}>
              <path d="M12 2C8.5 2 5 5 5 8.5c0 4.5 7 13.5 7 13.5s7-9 7-13.5C19 5 15.5 2 12 2zm0 9a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
            </svg>
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.3rem' }}>
            {tab === 'login' ? 'Welcome back' : 'Join DineBaku'}
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--t3)' }}>
            {tab === 'login' ? 'Sign in to your account' : 'Create a free account'}
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{
          display: 'flex', gap: '0.35rem', marginBottom: '1.5rem',
          background: 'var(--s3)', borderRadius: 10, padding: 3,
        }}>
          {['login', 'register'].map(t => (
            <button key={t} onClick={() => { setTab(t); setError('') }} style={{
              flex: 1, padding: '0.5rem', border: 'none', borderRadius: 8, cursor: 'pointer',
              fontWeight: 600, fontSize: '0.82rem',
              background: tab === t ? 'var(--accent)' : 'transparent',
              color: tab === t ? '#0c0a09' : 'var(--t3)',
              transition: 'all 0.2s',
              fontFamily: "'Inter', system-ui, sans-serif",
            }}>
              {t === 'login' ? 'Login' : 'Register'}
            </button>
          ))}
        </div>

        {tab === 'login' ? (
          <form onSubmit={handleLogin}>
            <label className="label">Email</label>
            <input className="input" type="email" placeholder="you@example.com" required autoFocus
              value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
              style={{ marginBottom: '0.75rem' }} />
            <label className="label">Password</label>
            <input className="input" type="password" placeholder="Your password" required
              value={loginPw} onChange={e => setLoginPw(e.target.value)}
              style={{ marginBottom: '0.35rem' }} />
            <div style={{ textAlign: 'right', marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--t4)', cursor: 'default' }}>
                Forgot password? (coming soon)
              </span>
            </div>
            {error && <p style={{ color: 'var(--red)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? <><span className="spinner" />Signing in…</> : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister}>
            <label className="label">Full name <span style={{ color: 'var(--red)' }}>*</span></label>
            <input className="input" placeholder="Your name" required autoFocus
              value={regName} onChange={e => setRegName(e.target.value)}
              style={{ marginBottom: '0.75rem' }} />
            <label className="label">Email <span style={{ color: 'var(--red)' }}>*</span></label>
            <input className="input" type="email" placeholder="you@example.com" required
              value={regEmail} onChange={e => setRegEmail(e.target.value)}
              style={{ marginBottom: '0.75rem' }} />
            <label className="label">Password <span style={{ color: 'var(--red)' }}>*</span></label>
            <input className="input" type="password" placeholder="Min 8 characters" required
              value={regPw} onChange={e => setRegPw(e.target.value)}
              style={{ marginBottom: '0.75rem' }} />
            <label className="label">Phone <span style={{ color: 'var(--t4)', fontWeight: 400 }}>optional</span></label>
            <input className="input" type="tel" placeholder="+994 XX XXX XXXX"
              value={regPhone} onChange={e => setRegPhone(e.target.value)}
              style={{ marginBottom: '0.75rem' }} />
            <label className="label">Age <span style={{ color: 'var(--t4)', fontWeight: 400 }}>optional</span></label>
            <input className="input" type="number" placeholder="13–99" min="13" max="99"
              value={regAge} onChange={e => setRegAge(e.target.value)}
              style={{ marginBottom: '0.35rem' }} />
            <p style={{ fontSize: '0.72rem', color: 'var(--t4)', marginBottom: '1.25rem' }}>
              Used for personalised recommendations.
            </p>
            {error && <p style={{ color: 'var(--red)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? <><span className="spinner" />Creating account…</> : 'Create Account'}
            </button>
          </form>
        )}

        <p style={{ fontSize: '0.7rem', color: 'var(--t4)', textAlign: 'center', marginTop: '1.25rem' }}>
          By continuing you agree to our Terms &amp; Privacy Policy
        </p>
      </div>
    </div>
  )
}
