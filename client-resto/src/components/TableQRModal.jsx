import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { tableQrUrl } from '../lib/qr'
import { v2Error } from '../features/v2/errors'
import { canRotateCodes, useRotateCodes } from '../features/v2/rotate'

// Shows, prints and downloads the QR code for one table. The QR encodes the
// consumer link https://<consumer host>/t/<table code> (see lib/qr.js).
//
// Printing uses a print-only sheet rendered into <body> (see .qr-print-sheet in
// index.css): while this modal is open, `body.qr-printing` hides the app and
// shows only the sheet. No popup window or inline document, so it also works
// under a strict CSP and on browsers that block popups.
//
// Managers and admins also get "Rotate this table's code" (sql/55 rotate_table_codes): the old QR dies at once, the
// new code comes back, `onRotated(tableId, code)` lets the Tables page swap it in and this modal re-renders with
// the new code, link and QR.
export default function TableQRModal({ table, code, restaurantName, onClose, onRotated }) {
  const { t } = useTranslation(['dashboard', 'common', 'v2'])
  const { restaurantId, staffRow } = useAuth()
  const canRotate = canRotateCodes(staffRow?.role)
  const { rotate, busy: rotating } = useRotateCodes(restaurantId)
  const [confirming, setConfirming] = useState(false)
  const [rotateDone, setRotateDone] = useState(false)
  const [rotateError, setRotateError] = useState('')
  // null when the dashboard isn't served from a resto.* / localhost host.
  const url = tableQrUrl(code)
  const tableName = t('common:tableLabel', { number: table.table_number })
  const [dataUrl, setDataUrl] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    document.body.classList.add('modal-open')
    if (url) document.body.classList.add('qr-printing')
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('modal-open', 'qr-printing')
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, url])

  useEffect(() => {
    let cancelled = false
    setDataUrl('')
    setFailed(false)
    if (!url) return undefined
    // Loaded on demand so the QR encoder stays out of the main bundle.
    import('qrcode')
      .then(mod => (mod.default || mod).toDataURL(url, {
        width: 640,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#1A1210', light: '#FFFFFF' },
      }))
      .then(png => { if (!cancelled) setDataUrl(png) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [url])

  function handleDownload() {
    if (!dataUrl) return
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `table-${String(table.table_number).replace(/[^\w-]+/g, '_')}-qr.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  function askRotate() {
    setRotateError('')
    setRotateDone(false)
    setConfirming(true)
  }

  async function handleRotate() {
    const res = await rotate(table.id)
    if (res.skipped) return
    setConfirming(false)
    if (res.error) {
      setRotateError(v2Error(res.error, t))
      return
    }
    const row = res.data.find(r => r.tableId === table.id) || res.data[0]
    setRotateDone(true)
    if (row) onRotated?.(table.id, row.code)
  }

  return (
    <>
      <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal qr-modal" role="dialog" aria-modal="true" aria-label={t('dashboard:qrTitle', { number: table.table_number })}>
          <div className="qr-modal-head">
            <h2 className="qr-modal-title">{t('dashboard:qrTitle', { number: table.table_number })}</h2>
            <button className="qr-modal-close" onClick={onClose} aria-label={t('common:close')}>✕</button>
          </div>

          {!url ? (
            <p className="qr-modal-warning" role="alert">{t('dashboard:qrHostUnavailable')}</p>
          ) : (
            <>
              <div className="qr-modal-frame">
                {dataUrl ? (
                  <img className="qr-modal-img" src={dataUrl} alt={t('dashboard:qrTitle', { number: table.table_number })} />
                ) : failed ? (
                  <p className="qr-modal-error">{t('dashboard:qrFailed')}</p>
                ) : (
                  <span className="spinner" aria-label={t('dashboard:qrGenerating')} />
                )}
              </div>

              <div className="qr-modal-meta">
                <span className="qr-modal-meta-label">{t('dashboard:qrLinkLabel')}</span>
                <span className="qr-modal-link">{url}</span>
              </div>
            </>
          )}

          <div className="qr-modal-meta">
            <span className="qr-modal-meta-label">{t('dashboard:qrCodeLabel')}</span>
            <span className="qr-modal-code">{code}</span>
          </div>

          {canRotate && (
            <div className="qr-rotate">
              {rotateDone && <p className="qr-modal-note" role="status">{t('dashboard:qrRotateDone')}</p>}
              {rotateError && <p className="qr-modal-fail" role="alert">{rotateError}</p>}
              {confirming ? (
                <>
                  <p className="qr-modal-warning" role="alert">{t('dashboard:qrRotateWarn')}</p>
                  <div className="qr-rotate-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={rotating}>
                      {t('common:cancel')}
                    </button>
                    <button type="button" className="btn btn-danger" onClick={handleRotate} disabled={rotating}>
                      {rotating && <span className="spinner" aria-hidden="true" />}
                      {t('dashboard:qrRotateConfirm')}
                    </button>
                  </div>
                </>
              ) : (
                <button type="button" className="btn btn-ghost qr-rotate-btn" onClick={askRotate} disabled={rotating}>
                  {t('dashboard:qrRotate')}
                </button>
              )}
            </div>
          )}

          <div className="qr-modal-actions">
            <button className="btn btn-ghost" onClick={onClose}>{t('common:close')}</button>
            <button className="btn btn-ghost" onClick={handleDownload} disabled={!dataUrl || rotating}>{t('dashboard:qrDownload')}</button>
            <button className="btn btn-primary" onClick={() => window.print()} disabled={!dataUrl || rotating}>{t('dashboard:qrPrint')}</button>
          </div>
        </div>
      </div>

      {url && createPortal(
        <div className="qr-print-sheet" aria-hidden="true">
          {restaurantName && <div className="qr-print-resto">{restaurantName}</div>}
          <div className="qr-print-table">{tableName}</div>
          {dataUrl && <img className="qr-print-img" src={dataUrl} alt="" />}
          <div className="qr-print-hint">{t('dashboard:qrScanToOrder')}</div>
          <div className="qr-print-code">{t('dashboard:qrOrEnterCode')}: <strong>{code}</strong></div>
        </div>,
        document.body
      )}
    </>
  )
}
