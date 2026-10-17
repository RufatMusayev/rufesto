import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useCart } from '../contexts/CartContext'
import { clearPendingClaim, rememberPendingClaim, sanitizeTableCode } from '../lib/pendingClaim'
import AuthModal from '../components/AuthModal'
import { claimErrorMessage } from '../features/dinein/mounts'
import './TableClaimPage.css'

// Landing page for the table QR deep link  https://<host>/t/<table_code>.
// Opening a link must never seat anyone by itself: signed-in guests get a "Join this table?"
// card first, and only the Join button calls the same claim_table() flow as typing the code on
// /table (CartContext.claimTable). Signed-out guests sign in first and are brought back here.
// (The in-app QR scanner, QRSheet, claims directly: scanning there is already the explicit action.)
// The table and restaurant can't be read from the code directly (access codes aren't publicly readable), so a
// signed-in guest's card asks table_preview(p_code), a read-only RPC that names them without seating anyone, and
// shows "<restaurant> · Table <n>" above Join. Until that answers, or when it is not deployed / fails, the card is
// the generic one: the preview only ever adds words, it never blocks joining.
export default function TableClaimPage() {
  const { code: rawCode } = useParams()
  const code = sanitizeTableCode(rawCode)
  const { t } = useTranslation(['table', 'booking', 'auth', 'common'])
  const { session, loading: authLoading } = useAuth()
  const { claimTable } = useCart()
  const navigate = useNavigate()

  const userId = session?.user?.id
  const [showAuth, setShowAuth] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)     // { restaurant, table, section } named by table_preview, or null
  const mounted = useRef(true)
  const previewed = useRef('')                 // the code table_preview was last asked about

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  // Signed out: remember the code for the sign-in round trip (OAuth / magic link reload the
  // app) and open the sign-in sheet once. Leaving this page signed-out forgets the code again.
  // Signed in: nothing is pending any more, so a later "Cancel" can't bounce back here.
  useEffect(() => {
    if (authLoading) return
    if (userId) { clearPendingClaim(); return }
    if (!code) return
    rememberPendingClaim(code)
    setShowAuth(true)
    return () => clearPendingClaim()
  }, [authLoading, code, userId])

  // Name the restaurant and table once the guest is signed in (the RPC is authenticated-only). One read per code.
  useEffect(() => {
    setPreview(null)
    if (!userId || !code) return undefined
    // one read per code even when React re-runs the effect (dev StrictMode, a token refresh): a throttled RPC
    // counts every call as an attempt
    if (previewed.current === code) return undefined
    previewed.current = code
    supabase.rpc('table_preview', { p_code: code }).then(({ data, error: err }) => {
      if (!mounted.current) return
      if (err) {
        // a code the server does not know says so now instead of after Join; anything else (RPC not deployed,
        // offline, throttled) leaves the generic card
        if (/invalid_code|invalid_seat|table_unavailable|too_many_attempts/.test(err.message || '')) setError(claimErrorMessage(err, t))
        return
      }
      const row = Array.isArray(data) ? data[0] : data
      if (!row || typeof row !== 'object') return
      const restaurant = row.restaurant_name ? String(row.restaurant_name) : ''
      const table = row.table_number != null && row.table_number !== '' ? String(row.table_number) : ''
      const section = row.section_name ? String(row.section_name) : ''
      if (restaurant || table) setPreview({ restaurant, table, section })
    }, () => {})
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, code])

  const runClaim = useCallback(async () => {
    setError('')
    setClaiming(true)
    const { error: claimErr } = await claimTable(code)
    if (!mounted.current) return
    setClaiming(false)
    if (claimErr) {
      setError(claimErrorMessage(claimErr, t))
      return
    }
    navigate('/table', { replace: true })
  }, [claimTable, code, navigate, t])

  const needsSignIn = !authLoading && !userId

  return (
    <div className="claim-page">
      <div className="card claim-card state-panel">
        {!code ? (
          <>
            <div className="state-icon state-icon-plain">⚠️</div>
            <h1 className="state-title">{t('table:claimInvalidTitle')}</h1>
            <p className="state-body">{t('table:errInvalidCode')}</p>
            <div className="state-actions">
              <Link to="/table" className="btn btn-primary">{t('table:claimEnterCode')}</Link>
            </div>
          </>
        ) : error ? (
          <>
            <div className="state-icon state-icon-plain">⚠️</div>
            <h1 className="state-title">{t('table:claimFailedTitle')}</h1>
            <p className="state-body">{error}</p>
            <div className="state-actions">
              <button className="btn btn-primary" onClick={runClaim}>{t('table:claimRetry')}</button>
              <Link to="/table" className="btn btn-ghost">{t('table:claimEnterCode')}</Link>
            </div>
          </>
        ) : needsSignIn ? (
          <>
            <div className="state-icon state-icon-plain">🍽️</div>
            <h1 className="state-title">{t('table:claimSignInTitle')}</h1>
            <p className="state-body">{t('table:claimSignInBody')}</p>
            <div className="state-actions">
              <button className="btn btn-primary" onClick={() => setShowAuth(true)}>{t('auth:signIn')}</button>
            </div>
          </>
        ) : authLoading || claiming ? (
          <>
            <div className="state-icon state-icon-plain">
              <span className="spinner" />
            </div>
            <h1 className="state-title">{claiming ? t('booking:claiming') : t('common:loading')}</h1>
          </>
        ) : (
          <>
            <div className="state-icon state-icon-plain">🍽️</div>
            <h1 className="state-title">{t('table:claimConfirmTitle')}</h1>
            {preview ? (
              <p className="claim-venue">
                {preview.restaurant ? <strong className="claim-venue-name">{preview.restaurant}</strong> : null}
                <span className="claim-venue-table">
                  {[preview.table ? t('common:tableLabel', { number: preview.table }) : '', preview.section].filter(Boolean).join(' · ')}
                </span>
              </p>
            ) : null}
            <p className="state-body">{t('table:claimConfirmBody')}</p>
            <div className="state-actions">
              <button className="btn btn-primary" onClick={runClaim}>{t('table:claimJoin')}</button>
              <button className="btn btn-ghost" onClick={() => navigate('/', { replace: true })}>{t('common:cancel')}</button>
            </div>
          </>
        )}
      </div>

      {showAuth && (
        <AuthModal onClose={() => setShowAuth(false)} />
      )}
    </div>
  )
}
