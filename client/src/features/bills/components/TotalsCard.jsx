import { useTranslation } from 'react-i18next'
import { formatPrice } from '../../../lib/helpers'

const pctOf = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0)
const minus = n => `−${formatPrice(n)}`

/** Subtotal, VAT, service, credits, tip paid so far, total. Markup as the "Session total" block on the Table
 *  screen; every figure is the server's. */
export default function TotalsCard({ bill }) {
  const { t } = useTranslation(['bills', 'common'])
  const rows = [
    [t('common:subtotal'), formatPrice(bill.subtotal)],
    [t('common:vatPct', { pct: pctOf(bill.tax, bill.subtotal) }), formatPrice(bill.tax)],
    [t('common:servicePct', { pct: pctOf(bill.service, bill.subtotal) }), formatPrice(bill.service)],
  ]
  if (bill.discount > 0) rows.push([t('bills:discount'), minus(bill.discount)])
  if (bill.creditsApplied > 0) rows.push([t('bills:credits'), minus(bill.creditsApplied)])
  if (bill.tip > 0) rows.push([t('bills:tipPaid'), formatPrice(bill.tip)])

  return (
    <section className="card bl-totals" aria-label={t('bills:summaryTitle')}>
      <div className="bl-label">{t('bills:summaryTitle')}</div>
      {rows.map(([label, value]) => (
        <div key={label} className="bl-total-row">
          <span>{label}</span>
          <span className="bl-mono">{value}</span>
        </div>
      ))}
      <div className="bl-total-row bl-total-grand">
        <span>{t('common:total')}</span>
        <span className="bl-mono bl-total-value">{formatPrice(bill.total)}</span>
      </div>
    </section>
  )
}
