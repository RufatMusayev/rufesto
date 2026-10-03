import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../contexts/AuthContext'
import { tableQrUrl } from '../../../lib/qr'
import { fetchQrData } from '../api'
import { v2Error } from '../errors'
import useLiveList from '../hooks/useLiveList'
import useQrImages from '../hooks/useQrImages'
import { applyRotatedCodes, buildQrCards } from '../qrCards'
import { canRotateCodes, useRotateCodes } from '../rotate'
import ConfirmModal from '../components/ConfirmModal'
import EmptyBlock from '../components/EmptyBlock'
import ErrorBanner from '../components/ErrorBanner'
import LoadError from '../components/LoadError'
import PrintToolbar from '../components/PrintToolbar'
import QrSheet from '../components/QrSheet'
import '../styles.css'

// Print one QR card per active table (plus one per chair with "Per chair"). Screen = preview of A4 sheets; print =
// a copy of the sheets portaled into <body> while `body.v2-qr-printing` hides
// the app (same technique as components/TableQRModal.jsx, own class names).
export default function QrSheetPage() {
  const { restaurantId, staffRow } = useAuth()
  const { t } = useTranslation(['v2', 'common', 'dashboard'])
  const load = useCallback(() => fetchQrData(restaurantId), [restaurantId])
  const { data, setData, error, loading, retry, reload } = useLiveList(load, null, restaurantId)

  const [section, setSection] = useState('all')
  const [perPage, setPerPage] = useState(6)
  const [showCode, setShowCode] = useState(true)
  const [perChair, setPerChair] = useState(false)

  // Rotate all codes (managers and admins): confirm -> RPC -> new codes on screen at once + silent refetch.
  const canRotate = canRotateCodes(staffRow?.role)
  const { rotate, busy: rotating } = useRotateCodes(restaurantId)
  const [confirmRotate, setConfirmRotate] = useState(false)
  const [rotateError, setRotateError] = useState('')
  const [rotateDone, setRotateDone] = useState(false)
  const cancelRotate = useCallback(() => setConfirmRotate(false), [])

  // null host mapping (not resto.* / localhost) means a QR would point nowhere.
  const linkable = !!tableQrUrl('x')
  const restaurantName = staffRow?.restaurants?.name || ''

  const visible = useMemo(
    () => (data ? data.tables.filter(tb => section === 'all' || tb.sectionId === section) : []),
    [data, section],
  )
  const missing = visible.filter(tb => !tb.code)
  // One card per table; "Per chair" adds one per seat after each table card (QR = <code>-S<n>).
  const cards = useMemo(() => buildQrCards(visible, perChair), [visible, perChair])
  const { images, progress, retry: retryImage } = useQrImages(cards, linkable)

  const ready = linkable && cards.length > 0 && !progress
    && cards.every(c => images[c.id] && images[c.id] !== 'error')

  async function handleRotate() {
    const res = await rotate(null)
    if (res.skipped) return
    setConfirmRotate(false)
    if (res.error) {
      setRotateDone(false)
      setRotateError(v2Error(res.error, t))
      return
    }
    setRotateError('')
    setRotateDone(true)
    // The RPC result already carries the new codes: show them now, then let the refetch confirm.
    setData(prev => applyRotatedCodes(prev, res.data))
    reload()
  }

  // Hide the app for printing only while there is a sheet to print instead.
  useEffect(() => {
    if (!ready) return undefined
    document.body.classList.add('v2-qr-printing')
    return () => document.body.classList.remove('v2-qr-printing')
  }, [ready])

  return (
    <div className="v2-page">
      <div className="v2-page-head">
        <div>
          <h1 className="page-title">{t('qrSheetTitle')}</h1>
          <p className="v2-page-sub">{t('qrSheetHint')}</p>
        </div>
      </div>

      {loading ? (
        <div className="v2-skel-qr-grid" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton v2-skel-qr" />)}
        </div>
      ) : !data ? (
        <LoadError message={v2Error(error, t)} onRetry={retry} />
      ) : data.tables.length === 0 ? (
        <EmptyBlock
          icon="🪑"
          title={t('qrNoTables')}
          action={<Link className="btn btn-ghost btn-sm" to="/tables">{t('qrGoTables')}</Link>}
        />
      ) : (
        <>
          <PrintToolbar
            sections={data.sections}
            section={section}
            onSection={setSection}
            perPage={perPage}
            onPerPage={setPerPage}
            showCode={showCode}
            onShowCode={setShowCode}
            perChair={perChair}
            onPerChair={setPerChair}
            canPrint={ready && !rotating}
            onPrint={() => window.print()}
            canRotate={canRotate}
            onRotate={() => { setRotateError(''); setRotateDone(false); setConfirmRotate(true) }}
            rotating={rotating}
            rotatedAt={data.rotatedAt}
          />

          <ErrorBanner message={rotateError} onDismiss={() => setRotateError('')} />

          {rotateDone && (
            <div className="v2-banner v2-banner--ok" role="status">
              <span>{t('rotateAllDone')}</span>
              <button type="button" className="v2-banner-close" onClick={() => setRotateDone(false)} aria-label={t('dismiss')}>✕</button>
            </div>
          )}

          {!linkable && <p className="v2-banner v2-banner--warn" role="alert">{t('qrHostUnavailable')}</p>}

          {missing.length > 0 && (
            <div className="v2-banner v2-banner--warn" role="status">
              <div>
                <strong>{t('qrMissingNotice', { count: missing.length })}</strong>
                <ul className="v2-missing">
                  {missing.map(tb => (
                    <li key={tb.id}>{t('common:tableLabel', { number: tb.number })} · {t('qrNoCode')}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {progress && (
            <p className="v2-muted" role="status">{t('qrGenerating', { done: progress.done, total: progress.total })}</p>
          )}

          {perChair && cards.length > 0 && (
            <p className="v2-muted" role="status">{t('qrPerChairCount', { count: cards.length })}</p>
          )}

          {linkable && cards.length > 0 && (
            <div className="v2-qr-preview">
              <QrSheet
                cards={cards}
                images={images}
                perPage={perPage}
                showCode={showCode}
                restaurantName={restaurantName}
                onRetry={retryImage}
              />
            </div>
          )}

          {ready && createPortal(
            <div className="v2-qr-print-root" aria-hidden="true">
              <QrSheet
                cards={cards}
                images={images}
                perPage={perPage}
                showCode={showCode}
                restaurantName={restaurantName}
                label={false}
              />
            </div>,
            document.body,
          )}
        </>
      )}

      {confirmRotate && (
        <ConfirmModal
          title={t('rotateAllTitle')}
          body={t('rotateAllBody')}
          confirmLabel={t('rotateAllConfirm')}
          danger
          busy={rotating}
          onConfirm={handleRotate}
          onCancel={cancelRotate}
        />
      )}
    </div>
  )
}
