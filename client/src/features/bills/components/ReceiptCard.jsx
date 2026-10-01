import { useTranslation } from 'react-i18next'
import { DemoBadge, DemoNotice } from './DemoBadge'
import FiscalBlock from './FiscalBlock'
import LoyaltyEarned from './LoyaltyEarned'
import { cleanDisplayName, formatPrice } from '../../../lib/helpers'
import { dishName } from '../mappers'

const localeTag = lang => (lang === 'az' ? 'az-AZ' : 'en-GB')

function formatWhen(iso, lang) {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  // The restaurant is in Baku: show its wall clock whatever the browser timezone is.
  return d.toLocaleString(localeTag(lang), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Baku' })
}

const Row = ({ label, value, strong }) => (
  <div className={`bl-r-row${strong ? ' bl-r-strong' : ''}`}><span>{label}</span><span>{value}</span></div>
)

/** Paper-style receipt: restaurant, time, table, every line, totals, payments, credits, fiscal block. */
export default function ReceiptCard({ bill, lang }) {
  const { t } = useTranslation(['bills', 'common'])
  const lines = bill.people.flatMap(p => p.items)
  const paid = bill.payments.filter(p => p.status === 'succeeded')
  const when = formatWhen(bill.paidAt || bill.createdAt, lang)

  return (
    <article className="card bl-receipt" aria-label={t('bills:receiptTitle')}>
      <header className="bl-r-head">
        <h2 className="bl-r-name">{bill.restaurant.name}</h2>
        {bill.restaurant.address ? <div className="bl-r-sub">{bill.restaurant.address}</div> : null}
        <div className="bl-r-sub">{when}</div>
        <div className="bl-r-sub">{t('common:tableLabel', { number: bill.table.label })}</div>
        {bill.receipt?.number ? <div className="bl-r-sub">{t('bills:receiptNumber', { number: bill.receipt.number })}</div> : null}
      </header>

      <hr className="bl-r-rule" />
      <div className="bl-r-lines">
        {lines.map(line => (
          <Row
            key={line.lineId || `${line.dishId}-${line.name}-${line.lineTotal}`}
            label={t('bills:itemLine', { qty: line.qty, name: dishName(line, lang) })}
            value={formatPrice(line.lineTotal)}
          />
        ))}
      </div>

      <hr className="bl-r-rule" />
      <Row label={t('common:subtotal')} value={formatPrice(bill.subtotal)} />
      <Row label={t('common:vatPct', { pct: bill.subtotal > 0 ? Math.round((bill.tax / bill.subtotal) * 100) : 0 })} value={formatPrice(bill.tax)} />
      <Row label={t('common:servicePct', { pct: bill.subtotal > 0 ? Math.round((bill.service / bill.subtotal) * 100) : 0 })} value={formatPrice(bill.service)} />
      {bill.discount > 0 ? <Row label={t('bills:discount')} value={`−${formatPrice(bill.discount)}`} /> : null}
      {bill.creditsApplied > 0 ? <Row label={t('bills:credits')} value={`−${formatPrice(bill.creditsApplied)}`} /> : null}
      {bill.tip > 0 ? <Row label={t('bills:tip')} value={formatPrice(bill.tip)} /> : null}
      <Row strong label={t('common:total')} value={formatPrice(bill.total)} />

      {paid.length ? (
        <>
          <hr className="bl-r-rule" />
          <div className="bl-r-title">{t('bills:receiptPayments')}</div>
          {paid.map(p => (
            <div key={p.id} className="bl-r-pay">
              <span className="bl-r-pay-label">
                {t(`bills:methodLabel.${p.method}`, { defaultValue: p.method })}
                {p.last4 ? ` •••• ${p.last4}` : ''}
                {p.name ? ` · ${cleanDisplayName(p.name)}` : ''}
                {p.isDemo ? <DemoBadge /> : null}
              </span>
              <span>{formatPrice(p.amount)}</span>
            </div>
          ))}
          {paid.some(p => p.isDemo) ? <DemoNotice /> : null}
        </>
      ) : null}

      <LoyaltyEarned value={bill.loyaltyEarned} />
      <hr className="bl-r-rule" />
      <FiscalBlock fiscal={bill.fiscal} />
    </article>
  )
}
