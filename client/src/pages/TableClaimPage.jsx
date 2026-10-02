import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { useCart } from '../contexts/CartContext'
import { clearPendingClaim, rememberPendingClaim, sanitizeTableCode } from '../lib/pendingClaim'
import AuthModal from '../components/AuthModal'
import { claimErrorMessage } from '../features/dinein/mounts'

// Landing page for the table QR deep link  https://<host>/t/<table_code>.
// Opening a link must never seat anyone by itself: signed-in guests get a "Join this table?"
// card first, and only the Join button calls the same claim_table() flow as typing the code on
// /table (CartContext.claimTable). Signed-out guests sign in first and are brought back here.
// (The in-app QR scanner, QRSheet, claims directly: scanning there is already the explicit action.)
// The table and restaurant can't be looked up from the code (access codes aren't publicly
// readable, only claim_table() resolves them), so the card is generic.
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
  const mounted = useRef(true)

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
