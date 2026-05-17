import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

/**
 * AuthModal — Phase 1 Authentication
 *
 * Flow:
 *   1. User enters email -> we send OTP via Supabase
 *   2. User enters 6-digit code -> we verify OTP
 *   3. If new user, collect name (required) + phone (optional)
 *   4. Done — session created
 *
 * Also offers Google & Apple OAuth one-tap buttons.
 */
export default function AuthModal({ onClose, onSuccess }) {
  const { sendOtp, verifyOtp, signInWithOAuth, updateUserMeta } = useAuth()

  // Steps: 'email' -> 'otp' -> 'profile' (only for new users)
  const [step, setStep] = useState('email')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Email + OTP state
  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')

  // New-user profile state
  const [name, setName]   = useState('')
  const [phone, setPhone] = useState('')

  async function handleSendOtp(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await sendOtp(email)
    setLoading(false)
    if (error) { setError(error.message); return }
    setStep('otp')
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { data, error } = await verifyOtp(email, otpCode)
    setLoading(false)
    if (error) { setError(error.message); return }

    // Check if user has a name set — if not, this is a new user
    const meta = data?.user?.user_metadata
    if (!meta?.name) {
      setStep('profile')
      return
    }
    onSuccess?.()
    onClose?.()
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setError('')
    setLoading(true)
    const { error } = await updateUserMeta({
      name: name.trim(),
      phone: phone.trim() || null,
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    onSuccess?.()
    onClose?.()
  }

  async function handleOAuth(provider) {
    setError('')
    const { error } = await signInWithOAuth(provider)
    if (error) setError(error.message)
    // OAuth redirects the page — no further action needed
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
            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 24, height: 24, color: '#F5F0E8' }}>
              <path d="M12 2C8.5 2 5 5 5 8.5c0 4.5 7 13.5 7 13.5s7-9 7-13.5C19 5 15.5 2 12 2zm0 9a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
            </svg>
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.3rem' }}>
            {step === 'email' && 'Welcome to Rufesto'}
            {step === 'otp' && 'Enter verification code'}
            {step === 'profile' && 'Complete your profile'}
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--t3)' }}>
            {step === 'email' && 'Sign in or create an account — no password needed'}
            {step === 'otp' && `We sent a 6-digit code to ${email}`}
            {step === 'profile' && 'Just a few details to get started'}
          </p>
        </div>

        {/* ── Step 1: Email entry ──────────────────────── */}
        {step === 'email' && (
          <>
            <form onSubmit={handleSendOtp}>
              <label className="label">Email</label>
              <input className="input" type="email" placeholder="you@example.com"
                required autoFocus value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ marginBottom: '1.25rem' }} />
              {error && <p style={{ color: 'var(--red)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                {loading ? <><span className="spinner" />Sending code...</> : 'Continue with Email'}
              </button>
            </form>

            {/* Divider */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              margin: '1.25rem 0', color: 'var(--t4)', fontSize: '0.75rem',
            }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              or
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            {/* OAuth buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button
                className="btn btn-ghost"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                onClick={() => handleOAuth('google')}
              >
                <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
              <button
                className="btn btn-ghost"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                onClick={() => handleOAuth('apple')}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 18, height: 18 }}>
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                Continue with Apple
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: OTP verification ─────────────────── */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp}>
            <label className="label">Verification code</label>
            <input className="input" type="text" inputMode="numeric" pattern="[0-9]*"
              placeholder="000000" required autoFocus maxLength={6}
              value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
              style={{
                marginBottom: '0.75rem', textAlign: 'center',
                fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.5em',
              }} />
            <div style={{ marginBottom: '1.25rem' }}>
              <button type="button" style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.78rem', color: 'var(--accent)', fontFamily: 'inherit',
              }} onClick={async () => {
                setError('')
                const { error } = await sendOtp(email)
                if (error) setError(error.message)
                else setError('')
              }}>
                Resend code
              </button>
              <span style={{ margin: '0 0.5rem', color: 'var(--t4)' }}>|</span>
              <button type="button" style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.78rem', color: 'var(--t3)', fontFamily: 'inherit',
              }} onClick={() => { setStep('email'); setOtpCode(''); setError('') }}>
                Change email
              </button>
            </div>
            {error && <p style={{ color: 'var(--red)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading || otpCode.length < 6}>
              {loading ? <><span className="spinner" />Verifying...</> : 'Verify'}
            </button>
          </form>
        )}

        {/* ── Step 3: Profile completion (new users) ──── */}
        {step === 'profile' && (
          <form onSubmit={handleSaveProfile}>
            <label className="label">Full name <span style={{ color: 'var(--red)' }}>*</span></label>
            <input className="input" placeholder="Your name" required autoFocus
              value={name} onChange={e => setName(e.target.value)}
              style={{ marginBottom: '0.75rem' }} />
            <label className="label">Phone <span style={{ color: 'var(--t4)', fontWeight: 400 }}>optional</span></label>
            <input className="input" type="tel" placeholder="+994 XX XXX XXXX"
              value={phone} onChange={e => setPhone(e.target.value)}
              style={{ marginBottom: '1.25rem' }} />
            {error && <p style={{ color: 'var(--red)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? <><span className="spinner" />Saving...</> : 'Get Started'}
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
