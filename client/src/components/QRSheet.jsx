import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Html5Qrcode } from 'html5-qrcode'
import { useAuth } from '../contexts/AuthContext'
import { useCart } from '../contexts/CartContext'

// claim_table() accepts EITHER a typed access code or a scanned QR token (p_code) and
// does the seating server-side — the client just passes whatever the guest gave us.
export default function QRSheet({ onClose }) {
  const { t } = useTranslation(['booking', 'table', 'common'])
  const { session } = useAuth()
  const { claimTable } = useCart()
  const [token,    setToken]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState(null)
  const [error,    setError]    = useState('')
  const [done,     setDone]     = useState(false)

  const [scanning, setScanning]     = useState(true)
  const [camError, setCamError]     = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const scannerRef = useRef(null)
  const closeTimerRef = useRef(null)

  useEffect(() => {
    return () => clearTimeout(closeTimerRef.current)
  }, [])

  useEffect(() => {
    if (!scanning || manualMode || done) return

    const scanner = new Html5Qrcode('qr-reader')
    scannerRef.current = scanner
    let started = false

    const config = { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 }
    const onSuccess = (decodedText) => {
      setScanning(false)
      // Only stop a scanner that actually finished starting — stopping one still
      // mid-start throws and the h5-qrcode error is swallowed either way.
      if (started) scanner.stop().catch(() => {})
      handleQRResult(decodedText)
    }

    scanner.start({ facingMode: 'environment' }, config, onSuccess, () => {})
      .then(() => { started = true })
      .catch(() => {
        scanner.start({ facingMode: 'user' }, config, onSuccess, () => {})
          .then(() => { started = true })
          .catch(() => {
            setCamError(true)
            setScanning(false)
          })
      })

    return () => {
      if (started) scanner.stop().catch(() => {})
    }
  }, [scanning, manualMode, done])

  function handleQRResult(text) {
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    const match = text.match(uuidPattern)
    if (match) {
      setToken(match[0])
      claim(match[0])
    } else {
      setError(t('booking:errInvalidQR'))
      setScanning(true)
    }
  }

  async function claim(code) {
    if (!session) {
      setError(t('booking:errNotAuthenticated'))
      return
    }
    setError('')
    setLoading(true)
    const { data, error: claimErr } = await claimTable(code)
    setLoading(false)

    if (claimErr) {
      const msg = claimErr.message || ''
      if (msg.includes('table_reserved')) setError(t('booking:reservedByOther'))
      else if (msg.includes('not_authenticated')) setError(t('booking:errNotAuthenticated'))
      else if (msg.includes('invalid_code')) setError(t('table:errInvalidCode'))
      else setError(t('booking:errClaimFailed'))
      if (!manualMode) setScanning(true)
      return
    }

    setResult(data)
    setDone(true)
    closeTimerRef.current = setTimeout(onClose, 1400)
  }

  async function handleLookup(e) {
    e.preventDefault()
    if (!token.trim()) return
    await claim(token.trim())
  }

  function handleRetryCamera() {
    setCamError(false)
    setManualMode(false)
    setError('')
    setScanning(true)
  }

  return (
    <div
      className="overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ alignItems: 'flex-end' }}
    >
      <div className="sheet">
        <div className="sheet-handle" />
        <div style={{ padding: '1rem 1.5rem 2.5rem' }}>

          {done ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'var(--sage-bg)', border: '1px solid var(--sage)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--sage)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.2rem', fontWeight: 700, color: 'var(--t1)', marginBottom: 6 }}>
                {t('booking:youreSeated')}
              </h2>
              {result && (
                <div style={{ color: 'var(--t2)', fontSize: '0.85rem', marginBottom: 4 }}>
                  {result.restaurant_name}
                  {result.table_number != null && ` · ${t('common:tableLabel', { number: result.table_number })}`}
                </div>
              )}
              <p style={{ color: 'var(--t3)', fontSize: '0.85rem' }}>
                {t('booking:seatedHint')}
              </p>
            </div>
          ) : (
            <>
              {/* Title */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <h2 style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: '1.2rem', fontWeight: 700, color: 'var(--t1)',
                }}>
                  {t('booking:scanTitle')}
                </h2>
                <button className="icon-btn" onClick={onClose}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <p style={{ color: 'var(--t3)', fontSize: '0.84rem', marginBottom: '1.25rem' }}>
                {t('booking:scanPrompt')}
              </p>

              {/* Camera viewfinder */}
              {!manualMode && !camError && (
                <div style={{
                  width: '100%', maxWidth: 340, margin: '0 auto 1rem',
                  borderRadius: 16, overflow: 'hidden',
                  background: '#000',
                  border: '2px solid var(--border)',
                  position: 'relative',
                  minHeight: 280,
                }}>
                  <div id="qr-reader" style={{ width: '100%' }} />
                  {scanning && (
                    <div style={{
                      position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
                      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
                      borderRadius: 100, padding: '5px 16px',
                      fontSize: '0.72rem', fontWeight: 600, color: '#F5F0E8',
                      whiteSpace: 'nowrap', zIndex: 10,
                    }}>
                      {t('booking:scanning')}
                    </div>
                  )}
                </div>
              )}

              {/* Camera error state */}
              {camError && !manualMode && (
                <div style={{
                  width: '100%', maxWidth: 300, height: 160, margin: '0 auto 1rem',
                  border: '2px dashed var(--border)', borderRadius: 16,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 8,
                  color: 'var(--t3)', fontSize: '0.78rem', textAlign: 'center',
                }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 1l22 22M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3l2-3h8l2 3h3a2 2 0 012 2v9" />
                  </svg>
                  <span>{t('booking:cameraDenied')}</span>
                  <button onClick={handleRetryCamera} className="btn btn-ghost"
                    style={{ fontSize: '0.72rem', padding: '4px 12px' }}>
                    {t('booking:retryCamera')}
                  </button>
                </div>
              )}

              {/* Manual mode hidden QR reader target */}
              {manualMode && <div id="qr-reader" style={{ display: 'none' }} />}

              {/* Toggle buttons */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: '1rem' }}>
                {!manualMode && (
                  <button className="btn btn-ghost"
                    style={{ fontSize: '0.75rem', padding: '5px 14px' }}
                    onClick={() => { setManualMode(true); setScanning(false); setError('') }}>
                    {t('booking:enterCodeManually')}
                  </button>
                )}
                {manualMode && (
                  <button className="btn btn-ghost"
                    style={{ fontSize: '0.75rem', padding: '5px 14px' }}
                    onClick={handleRetryCamera}>
                    {t('booking:useCameraInstead')}
                  </button>
                )}
              </div>

              {/* Manual token / access code input */}
              <form onSubmit={handleLookup}>
                <input
                  className="input"
                  placeholder={t('booking:pasteToken')}
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  style={{ marginBottom: '0.75rem' }}
                  required
                />
                {error && <p style={{ color: 'var(--red)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}
                <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading || !token.trim()}>
                  {loading ? <><span className="spinner" /> {t('booking:claiming')}</> : t('booking:findTable')}
                </button>
              </form>
              <button className="btn btn-ghost" style={{ width: '100%', marginTop: '0.5rem' }} onClick={onClose}>
                {t('common:cancel')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
