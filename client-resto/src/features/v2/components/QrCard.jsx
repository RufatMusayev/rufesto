import { useTranslation } from 'react-i18next'

// One printable card: restaurant, label, QR image, hint, optional code.
// `card` is { id, code, table, seat } (see qrCards.js): a table card (seat === null) or one chair of a table.
// `image` is a data URL, 'error' (generation failed) or undefined (pending).
// `onRetry` is passed on screen only; the print copy has no controls.
export default function QrCard({ restaurantName, card, image, showCode, onRetry }) {
  const { t } = useTranslation(['v2', 'common'])
  const { table, seat } = card
  const isSeat = seat !== null
  const tableName = t('common:tableLabel', { number: table.number })
  // "T5 · seat 3" on a chair card, "Table 5" on the table card. Numbers that already start with a letter
  // ("T5", "B2") are not prefixed again.
  const short = /^[0-9]/.test(table.number) ? t('common:tableNumberShort', { number: table.number }) : table.number
  const label = isSeat ? t('qrSeatLabel', { table: short, seat }) : tableName
  const alt = isSeat ? t('qrSeatAlt', { table: tableName, seat }) : t('qrAlt', { table: tableName })
  return (
    <div className={`v2-qr-card${isSeat ? ' v2-qr-card--seat' : ''}`}>
      {restaurantName && <div className="v2-qr-resto">{restaurantName}</div>}
      <div className="v2-qr-table">{label}</div>
      <div className="v2-qr-frame">
        {image && image !== 'error' ? (
          <img className="v2-qr-img" src={image} alt={alt} />
        ) : image === 'error' ? (
          <div className="v2-qr-fail">
            <span>{t('qrFailedCard')}</span>
            {onRetry && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRetry(card.id)}>{t('retry')}</button>}
          </div>
        ) : (
          <span className="spinner v2-qr-spinner" aria-label={t('qrGeneratingOne')} />
        )}
      </div>
      <div className="v2-qr-scan">{isSeat ? t('qrScanSeat') : t('qrScan')}</div>
      {showCode && card.code && (
        <div className="v2-qr-code">{t('qrOrCode')} <strong>{card.code}</strong></div>
      )}
    </div>
  )
}
