import { useTranslation } from 'react-i18next'
import { formatPrice } from '../../../lib/helpers'

/** Sticky bottom bar: "share + tip" and the primary pay button. Share + tip always equals the button amount. */
export default function PayBar({ share, tip, total, method, disabled, busy, onPay }) {
  const { t } = useTranslation('bills')
  const amount = formatPrice(total)
  return (
    <div className="bl-paybar bl-noprint">
      <div className="bl-paybar-sum" aria-live="polite">
        <span>{t('payBarShare', { amount: formatPrice(share) })}</span>
        {tip > 0 ? <span>{t('payBarTip', { amount: formatPrice(tip) })}</span> : null}
      </div>
      <button type="button" className="btn btn-primary bl-paybar-btn" disabled={disabled || busy} onClick={onPay}>
        {busy ? <span className="spinner" aria-hidden="true" /> : null}
        {method === 'reception' ? t('payBtnReception', { amount }) : t('payBtn', { amount })}
      </button>
    </div>
  )
}
