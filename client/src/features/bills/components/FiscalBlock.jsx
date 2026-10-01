import { useTranslation } from 'react-i18next'

const SAFE_URL = /^https?:\/\//i

/** Fiscal data when the bill has it (fiscal ID + QR image); otherwise the plain "not a fiscal receipt" label.
 *  No fiscal integration exists yet, so today this is always the label. */
export default function FiscalBlock({ fiscal }) {
  const { t } = useTranslation('bills')
  if (!fiscal || (!fiscal.fiscalId && !fiscal.qrUrl)) {
    return <p className="bl-fiscal-none">{t('fiscalNone')}</p>
  }
  return (
    <div className="bl-fiscal">
      {fiscal.fiscalId ? (
        <div className="bl-r-row"><span>{t('fiscalId')}</span><span>{fiscal.fiscalId}</span></div>
      ) : null}
      {SAFE_URL.test(fiscal.qrUrl) ? (
        <img className="bl-fiscal-qr" src={fiscal.qrUrl} alt={t('fiscalQrAlt')} width={132} height={132} loading="lazy" />
      ) : null}
    </div>
  )
}
