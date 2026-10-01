import { useTranslation } from 'react-i18next'

// One printable table card: restaurant, table, QR image, hint, optional code.
// `image` is a data URL, 'error' (generation failed) or undefined (pending).
// `onRetry` is passed on screen only; the print copy has no controls.
export default function QrCard({ restaurantName, table, image, showCode, onRetry }) {
  const { t } = useTranslation(['v2', 'common'])
  const tableName = t('common:tableLabel', { number: table.number })
  return (
    <div className="v2-qr-card">
      {restaurantName && <div className="v2-qr-resto">{restaurantName}</div>}
      <div className="v2-qr-table">{tableName}</div>
      <div className="v2-qr-frame">
        {image && image !== 'error' ? (
          <img className="v2-qr-img" src={image} alt={t('qrAlt', { table: tableName })} />
        ) : image === 'error' ? (
          <div className="v2-qr-fail">
            <span>{t('qrFailedCard')}</span>
            {onRetry && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRetry(table.id)}>{t('retry')}</button>}
          </div>
        ) : (
          <span className="spinner v2-qr-spinner" aria-label={t('qrGeneratingOne')} />
        )}
      </div>
      <div className="v2-qr-scan">{t('qrScan')}</div>
      {showCode && table.code && (
        <div className="v2-qr-code">{t('qrOrCode')} <strong>{table.code}</strong></div>
      )}
    </div>
  )
}
