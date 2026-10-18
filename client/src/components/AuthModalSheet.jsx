import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import BottomSheet from './ui/BottomSheet'
import { normalizePhone } from '../lib/phone'
import './authModal.css'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
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
 *
 * A BottomSheet in self-managed mode (a bottom sheet on a phone, a centred dialog on desktop): `onClose` is called once
 * the exit animation has finished, so the owner can unmount it. `onSuccess` fires as soon as the guest is signed in.
 */
export default function AuthModalSheet({ onClose, onSuccess }) {
  const { t } = useTranslation(['auth', 'common'])
  const { sendOtp, verifyOtp, signInWithOAuth, signInWithPassword, updateUserMeta, session, updateProfile } = useAuth()
  const sheetApi = useRef(null)

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

  function finish() {
    onSuccess?.()
    sheetApi.current?.close()
  }

  async function handleSendOtp(e) {
    e.preventDefault()
    setError('')
    const trimmed = email.trim().toLowerCase()
    if (!EMAIL_REGEX.test(trimmed)) {
      setError(t('auth:errInvalidEmail'))
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
    finish()
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
    if (!name.trim()) { setError(t('auth:errNameRequired')); return }
    // public.users.phone only accepts E.164 digits: "+994 50 123 4567" is saved as "+994501234567".
    const trimmedPhone = normalizePhone(phone)
    if (trimmedPhone === null) {
      setError(t('auth:errInvalidPhone'))
      return
    }
    setError('')
    setLoading(true)
    const trimmedName = name.trim()
    const { error } = await updateUserMeta({
      name: trimmedName,
      phone: trimmedPhone || null,
    })
    if (error) { setLoading(false); setError(error.message); return }
    // Also write the row the rest of the app actually reads (public.users.name/phone) —
    // auth.updateUser above only touches auth user_metadata. Best-effort: don't block
    // sign-in on this secondary write.
    if (session?.user?.id) {
      const { error: profileErr } = await updateProfile({ name: trimmedName, phone: trimmedPhone || null }) || {}
      if (profileErr) console.warn('Could not sync public.users profile:', profileErr.message)
    }
    setLoading(false)
    finish()
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
    if (!EMAIL_REGEX.test(trimmed)) { setError(t('auth:errInvalidEmail')); return }
    if (!password) { setError(t('auth:errEnterPassword')); return }
    setLoading(true)
    const { error } = await signInWithPassword(trimmed, password)
    setLoading(false)
    if (error) { setError(error.message); return }
    finish()
  }

  const STEP_TITLES = {
    email: t('auth:welcome'),
    otp: t('auth:checkInbox'),
    profile: t('auth:oneLastStep'),
    password: t('auth:passwordSignIn'),
  }
  const STEP_SUBTITLES = {
    email: t('auth:emailSubtitle'),
    otp: t('auth:otpSubtitle', { email }),
    profile: t('auth:profileSubtitle'),
    password: t('auth:passwordSubtitle'),
  }

  return (
    <BottomSheet
      id="auth" onClose={onClose} apiRef={sheetApi} labelledBy="au-title" initialFocus="input"
      header={
        <div className="au-x">
          <button type="button" className="icon-btn" onClick={() => sheetApi.current?.close()} aria-label={t('common:close')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      }
    >
      <div className="au-body">
        {/* Header */}
        <div className="au-head">
          <div className="au-icon" aria-hidden="true">🍽️</div>
          <h2 className="au-title" id="au-title">{STEP_TITLES[step]}</h2>
          <p className="au-sub">{STEP_SUBTITLES[step]}</p>
        </div>

        {/* Step 1: Email entry */}
        {step === 'email' && (
          <>
            {/* OAuth buttons */}
            <div className="au-oauth">
              <button type="button" className="au-oauth-btn tap-h row-pressable" onClick={() => handleOAuth('google')}>
                <svg viewBox="0 0 24 24" className="au-oauth-icon" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {t('auth:continueWithGoogle')}
              </button>
              <button type="button" className="au-oauth-btn tap-h row-pressable" onClick={() => handleOAuth('apple')}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="au-oauth-icon" aria-hidden="true">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                {t('auth:continueWithApple')}
              </button>
            </div>

            {/* Divider */}
            <div className="au-divider">
              <span className="au-rule" />
              {t('common:or')}
              <span className="au-rule" />
            </div>

            <form onSubmit={handleSendOtp}>
              <input
                className="input au-field"
                type="email"
                placeholder={t('auth:yourEmail')}
                aria-label={t('auth:yourEmail')}
                required autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
              {error && <p className="au-error" role="alert">{error}</p>}
              <button type="submit" className="btn btn-primary au-block" disabled={loading}>
                {loading ? <><span className="spinner" /> {t('auth:sendingCode')}</> : t('auth:continueWithEmail')}
              </button>
            </form>

            {import.meta.env.DEV && (
              <button type="button" className="tap au-link au-link-dev" onClick={() => { setStep('password'); setError('') }}>
                {t('auth:passwordTestingHint')}
              </button>
            )}
          </>
        )}

        {/* Dev-only: password sign-in */}
        {step === 'password' && (
          <form onSubmit={handlePasswordLogin}>
            <input
              className="input au-field"
              type="email"
              placeholder={t('auth:email')}
              aria-label={t('auth:email')}
              required autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <input
              className="input au-field"
              type="password"
              placeholder={t('auth:password')}
              aria-label={t('auth:password')}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            {error && <p className="au-error" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary au-block" disabled={loading}>
              {loading ? <><span className="spinner" /> {t('auth:signingIn')}</> : t('auth:signIn')}
            </button>
            <button type="button" className="tap au-link" onClick={() => { setStep('email'); setPassword(''); setError('') }}>
              {t('auth:backToEmailCode')}
            </button>
          </form>
        )}

        {/* Step 2: OTP verification */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp}>
            <input
              className="input au-field au-otp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              placeholder={t('auth:otpPlaceholder')}
              aria-label={t('auth:otpPlaceholder')}
              required autoFocus
              maxLength={6}
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
            />
            {error && <p className="au-error" role="alert">{error}</p>}

            <div className="au-row">
              <button
                type="button"
                className="tap-text au-resend"
                disabled={resendCooldown > 0}
                onClick={async () => {
                  if (resendCooldown > 0) return
                  setError('')
                  const { error } = await sendOtp(email)
                  if (error) setError(error.message)
                  else startCooldown()
                }}
              >
                {resendCooldown > 0
                  ? t('auth:resendCooldown', { seconds: resendCooldown })
                  : t('auth:resendCode')
                }
              </button>
              <span className="au-bar" aria-hidden="true">|</span>
              <button type="button" className="tap-text au-change" onClick={() => { setStep('email'); setOtpCode(''); setError('') }}>
                {t('auth:changeEmail')}
              </button>
            </div>

            <button type="submit" className="btn btn-primary au-block" disabled={loading || otpCode.length < 6}>
              {loading ? <><span className="spinner" /> {t('auth:verifying')}</> : t('auth:verify')}
            </button>
          </form>
        )}

        {/* Step 3: Profile completion (new users) */}
        {step === 'profile' && (
          <form onSubmit={handleSaveProfile}>
            <label className="label" htmlFor="au-name">{t('auth:fullName')} <span className="au-req">*</span></label>
            <input
              id="au-name"
              className="input au-field"
              placeholder={t('auth:yourName')}
              required autoFocus maxLength={80}
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <label className="label" htmlFor="au-phone">{t('auth:phone')} <span className="au-opt">{t('auth:optional')}</span></label>
            <input
              id="au-phone"
              className="input au-field"
              type="tel"
              placeholder={t('auth:phonePlaceholder')}
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
            {error && <p className="au-error" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary au-block" disabled={loading}>
              {loading ? <><span className="spinner" /> {t('auth:saving')}</> : t('auth:getStarted')}
            </button>
          </form>
        )}

        <p className="au-terms">{t('auth:termsNotice')}</p>
      </div>
    </BottomSheet>
  )
}
