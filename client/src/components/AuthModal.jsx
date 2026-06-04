import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_REGEX = /^\+?[0-9\s\-()]{7,20}$/
const RESEND_COOLDOWN = 60 // seconds

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
  const { sendOtp, verifyOtp, signInWithOAuth, signInWithPassword, updateUserMeta } = useAuth()

  // Steps: 'email' -> 'otp' -> 'profile' (only for new users). 'password' is dev-only.
  const [step, setStep] = useState('email')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Email + OTP state
  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [password, setPassword] = useState('')

  // New-user profile state
  const [name, setName]   = useState('')
  const [phone, setPhone] = useState('')

  // Resend cooldown state
  const [resendCooldown, setResendCooldown] = useState(0)
  const cooldownRef = useRef(null)

  // Clean up cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current)
    }
  }, [])

  const startCooldown = useCallback(() => {
    setResendCooldown(RESEND_COOLDOWN)
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current)
          cooldownRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  async function handleSendOtp(e) {
    e.preventDefault()
    setError('')
    const trimmed = email.trim().toLowerCase()
    if (!EMAIL_REGEX.test(trimmed)) {
      setError('Please enter a valid email address')
      return
    }
    setEmail(trimmed)
    setLoading(true)
    const { error } = await sendOtp(trimmed)
    setLoading(false)
    if (error) { setError(error.message); return }
    startCooldown()
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
    const trimmedPhone = phone.trim()
    if (trimmedPhone && !PHONE_REGEX.test(trimmedPhone)) {
      setError('Please enter a valid phone number (e.g. +994 50 123 4567)')
      return
    }
    setError('')
    setLoading(true)
    const { error } = await updateUserMeta({
      name: name.trim(),
      phone: trimmedPhone || null,
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

  // Dev-only: email + password sign-in for local testing without live OTP email.
  async function handlePasswordLogin(e) {
    e.preventDefault()
    setError('')
    const trimmed = email.trim().toLowerCase()
    if (!EMAIL_REGEX.test(trimmed)) { setError('Please enter a valid email address'); return }
    if (!password) { setError('Enter a password'); return }
    setLoading(true)
    const { error } = await signInWithPassword(trimmed, password)
    setLoading(false)
    if (error) { setError(error.message); return }
    onSuccess?.()
    onClose?.()
  }

  const STEP_TITLES = {
    email: 'Welcome back',
    otp: 'Check your inbox',
    profile: 'One last step',
    password: 'Password sign-in',
  }
  const STEP_SUBTITLES = {
    email: 'Sign in or create an account — no password needed',
    otp: `We sent a 6-digit code to ${email}`,
    profile: 'Just a few details to get you started',
    password: 'Local testing only — not available in production',
  }

  return (
    <div
      className="overlay center"
      onClick={e => e.target === e.currentTarget && onClose?.()}
    >
      <div style={{
        background: 'var(--s1)', borderRadius: 20,
        padding: '32px 24px', width: '100%', maxWidth: 380,
        margin: 'auto',
        animation: 'modalEnter 200ms var(--ease-out)',
        position: 'relative',
        boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
      }}>
        {/* Close button */}
        <button
          className="icon-btn"
          onClick={onClose}
          style={{ position: 'absolute', top: 14, right: 14 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'rgba(139,45,66,0.1)', border: '1px solid rgba(139,45,66,0.2)',
            margin: '0 auto 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.4rem',
          }}>
            🍽️
          </div>
          <h2 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: '1.3rem', fontWeight: 700,
            color: 'var(--t1)', marginBottom: 6,
          }}>
            {STEP_TITLES[step]}
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--t3)', lineHeight: 1.5 }}>
            {STEP_SUBTITLES[step]}
          </p>
        </div>

        {/* Step 1: Email entry */}
        {step === 'email' && (
          <>
            {/* OAuth buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1.25rem' }}>
              <button
                onClick={() => handleOAuth('google')}
                style={{
                  width: '100%', padding: '11px', borderRadius: 12,
                  border: '1px solid var(--border)', background: 'var(--s2)',
                  color: 'var(--t1)', fontSize: '0.86rem', fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  cursor: 'pointer', transition: 'background 150ms',
                }}
              >
                <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, flexShrink: 0 }}>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
              <button
                onClick={() => handleOAuth('apple')}
                style={{
                  width: '100%', padding: '11px', borderRadius: 12,
                  border: '1px solid var(--border)', background: 'var(--s2)',
                  color: 'var(--t1)', fontSize: '0.86rem', fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  cursor: 'pointer', transition: 'background 150ms',
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 18, height: 18, flexShrink: 0 }}>
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                Continue with Apple
              </button>
            </div>

            {/* Divider */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              margin: '0 0 1.25rem', color: 'var(--t4)', fontSize: '0.75rem',
            }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              or
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            <form onSubmit={handleSendOtp}>
              <input
                className="input"
                type="email"
                placeholder="Your email"
                required autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ marginBottom: error ? 6 : '1.25rem' }}
              />
              {error && (
                <p style={{ color: 'var(--red)', fontSize: '0.76rem', marginBottom: 10, marginTop: 2 }}>{error}</p>
              )}
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                {loading ? <><span className="spinner" /> Sending code…</> : 'Continue with Email'}
              </button>
            </form>

            {import.meta.env.DEV && (
              <button
                type="button"
                onClick={() => { setStep('password'); setError('') }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '0.74rem', color: 'var(--t4)', fontFamily: 'inherit',
                  marginTop: '1rem', width: '100%', padding: 0,
                }}
              >
                🔧 Sign in with password (testing)
              </button>
            )}
          </>
        )}

        {/* Dev-only: password sign-in */}
        {step === 'password' && (
          <form onSubmit={handlePasswordLogin}>
            <input
              className="input"
              type="email"
              placeholder="Email"
              required autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ marginBottom: '0.75rem' }}
            />
            <input
              className="input"
              type="password"
              placeholder="Password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ marginBottom: error ? 6 : '1rem' }}
            />
            {error && (
              <p style={{ color: 'var(--red)', fontSize: '0.76rem', marginBottom: 10 }}>{error}</p>
            )}
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? <><span className="spinner" /> Signing in…</> : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('email'); setPassword(''); setError('') }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.78rem', color: 'var(--t3)', fontFamily: 'inherit',
                marginTop: '1rem', width: '100%', padding: 0,
              }}
            >
              ← Back to email code
            </button>
          </form>
        )}

        {/* Step 2: OTP verification */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp}>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="000000"
              required autoFocus
              maxLength={6}
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
              style={{
                marginBottom: error ? 6 : '0.75rem',
                textAlign: 'center',
                fontFamily: "'DM Mono', monospace",
                fontSize: '1.6rem', fontWeight: 700,
                letterSpacing: '0.4em',
              }}
            />
            {error && (
              <p style={{ color: 'var(--red)', fontSize: '0.76rem', marginBottom: 10 }}>{error}</p>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={resendCooldown > 0}
                style={{
                  background: 'none', border: 'none',
                  cursor: resendCooldown > 0 ? 'default' : 'pointer',
                  fontSize: '0.78rem',
                  color: resendCooldown > 0 ? 'var(--t4)' : 'var(--accent)',
                  fontFamily: 'inherit',
                  opacity: resendCooldown > 0 ? 0.6 : 1,
                  padding: 0,
                }}
                onClick={async () => {
                  if (resendCooldown > 0) return
                  setError('')
                  const { error } = await sendOtp(email)
                  if (error) setError(error.message)
                  else startCooldown()
                }}
              >
                {resendCooldown > 0
                  ? <><span style={{ fontFamily: "'DM Mono', monospace" }}>{resendCooldown}s</span> to resend</>
                  : 'Resend code'
                }
              </button>
              <span style={{ color: 'var(--border)', lineHeight: '1.5' }}>|</span>
              <button
                type="button"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '0.78rem', color: 'var(--t3)', fontFamily: 'inherit',
                  padding: 0,
                }}
                onClick={() => { setStep('email'); setOtpCode(''); setError('') }}
              >
                Change email
              </button>
            </div>

            <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading || otpCode.length < 6}>
              {loading ? <><span className="spinner" /> Verifying…</> : 'Verify'}
            </button>
          </form>
        )}

        {/* Step 3: Profile completion (new users) */}
        {step === 'profile' && (
          <form onSubmit={handleSaveProfile}>
            <label className="label">Full name <span style={{ color: 'var(--red)' }}>*</span></label>
            <input
              className="input"
              placeholder="Your name"
              required autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ marginBottom: '0.75rem' }}
            />
            <label className="label">Phone <span style={{ color: 'var(--t4)', fontWeight: 400 }}>optional</span></label>
            <input
              className="input"
              type="tel"
              placeholder="+994 XX XXX XXXX"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              style={{ marginBottom: error ? 6 : '1.25rem' }}
            />
            {error && (
              <p style={{ color: 'var(--red)', fontSize: '0.76rem', marginBottom: 10 }}>{error}</p>
            )}
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? <><span className="spinner" /> Saving…</> : 'Get Started'}
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
