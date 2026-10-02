import { useTranslation } from 'react-i18next'
import { formatPrice } from '../../../lib/helpers'

/**
 * Subtotal, VAT, service charge (only when the restaurant charges one) and the total the guest pays. Used by the
 * cart (what will be charged), the "Order placed" panel and the table screen (server amounts). Rows with a null
 * amount are left out, so a server answer without a breakdown still shows its total.
 *   estimate   the rates are the server defaults, not read from the restaurant: say so
 *   showTotal  false = the caller prints the total itself
 *   totalClass extra class on the total amount
 */
export default function OrderTotals({
  subtotal = null, tax = null, service = null, total, taxPct = null, servicePct = null,
  totalLabel, estimate = false, showTotal = true, totalClass = '',
}) {
  const { t } = useTranslation(['common', 'cart'])
  const showVat = tax != null && (tax > 0 || taxPct > 0)
  const showService = service != null && (service > 0 || servicePct > 0)
  return (
    <div className="dn-totals">
      {subtotal != null ? (
        <div className="dn-totals-row"><span>{t('common:subtotal')}</span><span className="dn-money">{formatPrice(subtotal)}</span></div>
      ) : null}
      {showVat ? (
        <div className="dn-totals-row">
          <span>{taxPct != null ? t('common:vatPct', { pct: taxPct }) : t('common:tax')}</span>
          <span className="dn-money">{formatPrice(tax)}</span>
        </div>
      ) : null}
      {showService ? (
        <div className="dn-totals-row">
          <span>{servicePct != null ? t('common:servicePct', { pct: servicePct }) : t('common:service')}</span>
          <span className="dn-money">{formatPrice(service)}</span>
        </div>
      ) : null}
      {showTotal ? (
        <div className="dn-totals-row dn-totals-total">
          <span>{totalLabel || t('common:total')}</span>
          <span className={`dn-money ${totalClass}`.trim()}>{formatPrice(total)}</span>
        </div>
      ) : null}
      {estimate ? <p className="dn-totals-note">{t('cart:rateEstimate')}</p> : null}
    </div>
  )
}
