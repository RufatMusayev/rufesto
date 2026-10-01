import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { tableQrUrl } from '../lib/qr'

// Shows, prints and downloads the QR code for one table. The QR encodes the
// consumer link https://<consumer host>/t/<table code> (see lib/qr.js).
//
// Printing uses a print-only sheet rendered into <body> (see .qr-print-sheet in
// index.css): while this modal is open, `body.qr-printing` hides the app and
// shows only the sheet. No popup window or inline document, so it also works
// under a strict CSP and on browsers that block popups.
export default function TableQRModal({ table, code, restaurantName, onClose }) {
  const { t } = useTranslation(['dashboard', 'common'])
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

          <div className="qr-modal-actions">
            <button className="btn btn-ghost" onClick={onClose}>{t('common:close')}</button>
            <button className="btn btn-ghost" onClick={handleDownload} disabled={!dataUrl}>{t('dashboard:qrDownload')}</button>
            <button className="btn btn-primary" onClick={() => window.print()} disabled={!dataUrl}>{t('dashboard:qrPrint')}</button>
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
