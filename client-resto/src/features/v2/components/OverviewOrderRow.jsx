import { useTranslation } from 'react-i18next'
import { categoryEmoji, formatPrice, timeAgo } from '@shared/helpers'
import { orderStatusLabelKey, orderStatusStyle } from '../../../lib/orderStatus'

// One line of "Recent orders". The text column is the only part that can shrink (ellipsis); the price and the
// status never leave the row, so the page cannot grow wider than the screen (.ov-order in ops.css).
export default function OverviewOrderRow({ order }) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const s = orderStatusStyle(order.status)
  const items = order.order_items || []
  const names = items.slice(0, 2).map(i => `${i.quantity}× ${i.dishes?.name || t('dashboard:itemFallback')}`).join(', ')
  const more = items.length > 2 ? ` +${items.length - 2}` : ''

  return (
    <div className="ov-order">
      <div className="ov-order-icon" aria-hidden="true">{items[0] ? categoryEmoji(items[0].dishes?.category) : '📋'}</div>
      <div className="ov-order-main">
        <div className="ov-order-items">{names || t('dashboard:order')}{more}</div>
        <div className="ov-order-meta">
          {t('common:tableLabel', { number: order.tables?.table_number || '—' })} · {timeAgo(order.placed_at, i18n.language)}
        </div>
      </div>
      <div className="ov-order-side">
        <div className="ov-order-price">{formatPrice(order.total_amount)}</div>
        <span className="ov-order-status" style={{ background: s.bg, color: s.color }}>{t(`dashboard:${orderStatusLabelKey(order.status)}`)}</span>
      </div>
    </div>
  )
}
