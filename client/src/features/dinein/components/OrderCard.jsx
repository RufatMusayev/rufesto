import { useTranslation } from 'react-i18next'
import { formatPrice } from '../../../lib/helpers'
import { Pill } from '../../../components/ui'
import DishThumb from '../../../components/DishThumb'
import { statusView } from '../orderStatus'
import { inclusiveLines } from '../pricing'
import { formatBakuTime } from '../../bookings/timeFormat'
import OrderTimeline from './OrderTimeline'
import OrderTotals from './OrderTotals'

/**
 * One order of the visit on the table screen: its status badge (live, from orders.status), the Placed > Preparing >
 * Ready > Served timeline, the dishes and the server-computed amounts. Dish lines are VAT-inclusive, exactly as the bill
 * prints them (inclusiveLines), so a dish costs the same here and on /bill; the footer itemises Subtotal / VAT / Total.
 * The time is the 24-hour Baku clock. `rates` = { taxRate, serviceRate } of the restaurant (ratesFromOrders), only used
 * for the "VAT (18%)" labels; the amounts are always the server's.
 */
export default function OrderCard({ order, number, rates }) {
  const { t } = useTranslation(['table', 'common'])
  const status = order.status || 'open'
  const view = statusView(status)
  const items = order.order_items || []
  const time = order.placed_at ? formatBakuTime(order.placed_at) : ''
  const lines = inclusiveLines(order)
  const hasBreakdown = Number(order.subtotal) > 0

  return (
    <article className={`dn-order stagger-item is-${status}`}>
      <header className="dn-order-head">
        <div className="dn-order-title">
          <div className="dn-order-name">{t('table:orderNumber', { number })}</div>
          <div className="dn-order-time">{time}</div>
        </div>
        <Pill tone={view.tone}>{t(`table:${view.label}`)}</Pill>
      </header>

      <OrderTimeline status={status} />

      <ul className="dn-order-items">
        {items.map(item => {
          const incl = lines.get(item.id)          // undefined: no breakdown on this order, show the net price
          const unit = incl ? incl.unit : item.unit_price
          const line = incl ? incl.line : item.unit_price * item.quantity
          return (
            <li key={item.id} className="dn-order-item">
              <DishThumb name={item.dishes?.name} category={item.dishes?.category} photo={item.dishes?.photo} />
              <div className="dn-order-item-main">
                <div className="dn-order-item-name">{item.dishes?.name || t('table:dishFallback')}</div>
                <div className="dn-order-item-qty">{item.quantity}x {formatPrice(unit)}</div>
              </div>
              <span className="dn-money">{formatPrice(line)}</span>
            </li>
          )
        })}
      </ul>

      <footer className="dn-order-foot">
        <OrderTotals
          subtotal={hasBreakdown ? Number(order.subtotal) : null}
          tax={hasBreakdown ? Number(order.tax_amount) || 0 : null}
          service={hasBreakdown ? Number(order.service_charge) || 0 : null}
          taxPct={rates?.taxRate ?? null}
          servicePct={rates?.serviceRate ?? null}
          total={Number(order.total_amount) || 0}
          totalLabel={t('table:orderTotal')}
        />
      </footer>
    </article>
  )
}
