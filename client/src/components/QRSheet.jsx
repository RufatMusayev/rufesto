import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Html5Qrcode } from 'html5-qrcode'
import { useAuth } from '../contexts/AuthContext'
import { useCart } from '../contexts/CartContext'
import { sanitizeTableCode } from '../lib/pendingClaim'
import BottomSheet from './ui/BottomSheet'
import { claimErrorMessage } from '../features/dinein/mounts'
import { stopScanner } from './QRSheetScanner'
import './qrSheet.css'

// claim_table() accepts EITHER a typed access code or a scanned QR token (p_code) and
// does the seating server-side — the client just passes whatever the guest gave us.
//
// Optional `onCode(code)`: the caller does the claiming itself (e.g. a booking host seating the booking at the
// scanned table via claim_table_from_booking). The sheet then only reads the code and calls it; it resolves
// { error: 'translated text' } (shown, scanner restarts) or { data: { restaurant_name, table_number, session_status } }
// (shown on the success screen, then onClose; that caller also decides where to go next).
//
// Without `onCode` the sheet claims the table itself and, after the success screen, closes and opens /table.
// It is a BottomSheet in controlled mode: the `onClose` prop is called once the exit animation has finished, so the
// parent can unmount it; closing starts by dropping `open`, which also stops the camera at once.
// The camera is stopped in exactly one place, the cleanup of the scanning effect below (through stopScanner,
// which is idempotent and never throws): a decoded code, a mode switch, the success screen and closing/unmounting
// all end that effect. Stopping it anywhere else, twice, blanked the whole app (QA persona-leyla #1).
export default function QRSheet({ onClose, onCode }) {
  const { t } = useTranslation(['booking', 'table', 'common'])
  const { session } = useAuth()
  const { claimTable } = useCart()
  const [token,    setToken]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState(null)
  const [error,    setError]    = useState('')
  const [done,     setDone]     = useState(false)

  const [scanning, setScanning]     = useState(true)
  const [scanRun, setScanRun]       = useState(0)     // bumped to start a fresh camera run (see resumeScan)
  const [camError, setCamError]     = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [open, setOpen] = useState(true)
  const sheetApi = useRef(null)    // BottomSheet's { close, navigate }
  const openRef = useRef(true)
  openRef.current = open
  const dismiss = useCallback(() => setOpen(false), [])
  const closeTimerRef = useRef(null)
  const stopRef = useRef(null)     // the stop of the previous camera run (a promise), awaited by the next run
  const aliveRef = useRef(true)
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode
  const resultRef = useRef(null)   // always the latest handleQRResult: the camera callback outlives the render that made it
  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false; clearTimeout(closeTimerRef.current) }
  }, [])

  // One camera run per (open, scanning, manualMode, done, scanRun). Its cleanup is the only place that stops the camera.
  useEffect(() => {
    if (!open || !scanning || manualMode || done) return undefined

    let scanner
    try {
      scanner = new Html5Qrcode('qr-reader')
    } catch {
      // the viewfinder element is not there: fall back to the typed code instead of throwing out of the effect
      setCamError(true)
      setScanning(false)
      return undefined
    }
    let live = true        // false once this run was torn down
    let decoded = false    // the library keeps calling onSuccess until the camera is closed: take the first frame only

    const config = { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 }
    const onSuccess = decodedText => {
      if (!live || decoded) return
      // not one of our codes: say so and let the same camera run keep looking (no restart per frame)
      if (!resultRef.current(decodedText)) return
      decoded = true
      setScanning(false)   // ends this run; the cleanup below stops the camera, once
    }
    const start = facingMode => scanner.start({ facingMode }, config, onSuccess, () => {})

    // A new run waits for the previous camera to be released (its teardown edits the same #qr-reader element).
    Promise.resolve(stopRef.current)
      .then(() => (live ? start('environment') : undefined))
      .catch(() => (live ? start('user') : undefined))
      // torn down while the camera was still opening: nothing could be stopped then, release it now
      .then(() => { if (!live) stopRef.current = stopScanner(scanner) })
      .catch(() => {
        if (!live) return
        setCamError(true)
        setScanning(false)
      })

    return () => {
      live = false
      stopRef.current = stopScanner(scanner)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scanning, manualMode, done, scanRun])

  // Back to scanning after a refused claim. The bump makes a new camera run even if `scanning` is already true.
  function resumeScan() {
    setScanning(true)
    setScanRun(n => n + 1)
  }

  // New QR codes encode a deep link  https://<host>/t/<table_code>; older printed ones are the
  // bare table token (a UUID, possibly inside some other text). Both end up in claim_table().
  function extractTableCode(text) {
    const link = text.trim().match(/^https?:\/\/[^/?#]+\/t\/([^/?#]+)/i)
    if (link) {
      try { return sanitizeTableCode(decodeURIComponent(link[1])) } catch { return null }
    }
    // a token may carry a chair suffix (<token>-S3): keep it, claim_table seats the guest on that chair
    const uuid = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-S\d{1,3})?/i)
    return uuid ? uuid[0] : null
  }

  // Returns true when the text is one of our codes (the claim has started), false when it is not (the error is shown).
  function handleQRResult(text) {
    const code = extractTableCode(text)
    if (!code) {
      setError(t('booking:errInvalidQR'))
      return false
    }
    setToken(code)
    claim(code)
    return true
  }
  resultRef.current = handleQRResult

  async function claim(code) {
    if (!session) {
      setError(t('booking:errNotAuthenticated'))
      return
    }
    setError('')
    setLoading(true)

    if (onCodeRef.current) {
      const res = await onCodeRef.current(code)
      if (!aliveRef.current || !openRef.current) return   // the guest closed the sheet meanwhile: say nothing, move nobody
      setLoading(false)
      if (res?.error) {
        setError(res.error)
        if (!manualMode) resumeScan()
        return
      }
      setResult(res?.data ?? null)
      setDone(true)
      // this caller seats the guest itself and decides where to go once the sheet closes
      closeTimerRef.current = setTimeout(dismiss, 1400)
      return
    }

    const { data, error: claimErr } = await claimTable(code)
    if (!aliveRef.current || !openRef.current) return
    setLoading(false)

    if (claimErr) {
      setError(claimErrorMessage(claimErr, t))
      if (!manualMode) resumeScan()
      return
    }

    setResult(data)
    setDone(true)
    // Success screen for a moment, then close the sheet (the camera is long released by then) and open the table.
    // A pending guest (not yet approved by the host) lands on /table too, which renders the PendingJoin waiting
    // screen based on CartContext's sessionStatus.
    closeTimerRef.current = setTimeout(() => sheetApi.current?.navigate('/table'), 1400)
  }

  async function handleLookup(e) {
    e.preventDefault()
    const typed = token.trim()
    if (!typed) return
    // Accept a pasted table link as well as a bare code/token.
    await claim(extractTableCode(typed) ?? typed)
  }

  function handleRetryCamera() {
    setCamError(false)
    setManualMode(false)
    setError('')
    setScanning(true)
  }

  const pending = result?.session_status === 'pending'

  return (
    <BottomSheet
      id="qr" size="large" open={open} onClose={dismiss} onClosed={onClose} apiRef={sheetApi}
      title={done ? undefined : t('booking:scanTitle')}
      label={done ? (pending ? t('booking:requestSentTitle') : t('booking:youreSeated')) : undefined}
    >
      {done ? (
        <div className="qr-done">
          <div className={`state-icon ${pending ? '' : 'state-icon-sage'}`} aria-hidden="true">
            {pending ? (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 15" />
              </svg>
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--sage)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
          <h2 className="state-title">{pending ? t('booking:requestSentTitle') : t('booking:youreSeated')}</h2>
          {result && (
            <div className="state-body">
              {result.restaurant_name}
              {result.table_number != null && ` · ${t('common:tableLabel', { number: result.table_number })}`}
            </div>
          )}
          <p className="qr-done-hint">{pending ? t('booking:pendingApprovalHint') : t('booking:seatedHint')}</p>
        </div>
      ) : (
        <>
          <p className="qr-prompt">{t('booking:scanPrompt')}</p>

          {/* Camera viewfinder */}
          {!manualMode && !camError && (
            <div className="qr-viewfinder">
              <div id="qr-reader" />
              {scanning && <div className="qr-scanning">{t('booking:scanning')}</div>}
            </div>
          )}

          {/* Camera error state */}
          {camError && !manualMode && (
            <div className="qr-cam-error">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M1 1l22 22M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3l2-3h8l2 3h3a2 2 0 012 2v9" />
              </svg>
              <span>{t('booking:cameraDenied')}</span>
              <button type="button" onClick={handleRetryCamera} className="btn btn-ghost">{t('booking:retryCamera')}</button>
            </div>
          )}

          {/* Manual mode hidden QR reader target */}
          {manualMode && <div id="qr-reader" hidden />}

          {/* Toggle buttons */}
          <div className="qr-toggles">
            {!manualMode && (
              <button type="button" className="btn btn-ghost" onClick={() => { setManualMode(true); setScanning(false); setError('') }}>
                {t('booking:enterCodeManually')}
              </button>
            )}
            {manualMode && (
              <button type="button" className="btn btn-ghost" onClick={handleRetryCamera}>
                {t('booking:useCameraInstead')}
              </button>
            )}
          </div>

          {/* Manual token / access code input */}
          <form onSubmit={handleLookup}>
            <input
              className="input qr-input"
              placeholder={t('booking:pasteToken')}
              aria-label={t('booking:pasteToken')}
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={e => setToken(e.target.value)}
              required
            />
            {error && <p className="qr-error" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary qr-submit" disabled={loading || !token.trim()}>
              {loading ? <><span className="spinner" /> {t('booking:claiming')}</> : t('booking:findTable')}
            </button>
          </form>
          <button type="button" className="btn btn-ghost qr-cancel" onClick={dismiss}>{t('common:cancel')}</button>
        </>
      )}
    </BottomSheet>
  )
}
