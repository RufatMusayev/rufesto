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
import EmptyBlock from '../components/EmptyBlock'
import LoadError from '../components/LoadError'
import PrintToolbar from '../components/PrintToolbar'
import QrSheet from '../components/QrSheet'
import '../styles.css'

// Print one QR card per active table. Screen = preview of A4 sheets; print =
// a copy of the sheets portaled into <body> while `body.v2-qr-printing` hides
// the app (same technique as components/TableQRModal.jsx, own class names).
export default function QrSheetPage() {
  const { restaurantId, staffRow } = useAuth()
  const { t } = useTranslation(['v2', 'common', 'dashboard'])
  const load = useCallback(() => fetchQrData(restaurantId), [restaurantId])
  const { data, error, loading, retry } = useLiveList(load, null, restaurantId)

  const [section, setSection] = useState('all')
  const [perPage, setPerPage] = useState(6)
  const [showCode, setShowCode] = useState(true)

  // null host mapping (not resto.* / localhost) means a QR would point nowhere.
  const linkable = !!tableQrUrl('x')
  const restaurantName = staffRow?.restaurants?.name || ''

  const visible = useMemo(
    () => (data ? data.tables.filter(tb => section === 'all' || tb.sectionId === section) : []),
    [data, section],
  )
  const printable = useMemo(() => visible.filter(tb => tb.code), [visible])
  const missing = visible.filter(tb => !tb.code)
  const { images, progress, retry: retryImage } = useQrImages(printable, linkable)

  const ready = linkable && printable.length > 0 && !progress
    && printable.every(tb => images[tb.id] && images[tb.id] !== 'error')

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
            canPrint={ready}
            onPrint={() => window.print()}
          />

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

          {linkable && printable.length > 0 && (
            <div className="v2-qr-preview">
              <QrSheet
                tables={printable}
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
                tables={printable}
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
    </div>
  )
}
