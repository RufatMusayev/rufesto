import { useTranslation } from 'react-i18next'
import { orderStatusLabelKey, orderStatusStyle } from '../../lib/orderStatus'
import { dishName } from '../../lib/dishName'

// The live orders of one table on a waiter card: status, what is in it, and "Mark served" on the ones that are ready
// (only for the roles that may change an order's status; a cashier sees the list without the button).
//   orders    [{ id, status, order_items: [{ quantity, dishes: { name } }] }], oldest first
//   actingId  id of the order whose action is in flight
export default function TableOrders({ orders, canServe, actingId, onServe }) {
  const { t, i18n } = useTranslation('dashboard')
  if (!orders.length) return null

  return (
    <ul className="wt-orders">
      {orders.map(o => {
        const s = orderStatusStyle(o.status)
        const names = (o.order_items || []).map(i => `${i.quantity}× ${dishName(i.dishes, i18n.language, t('itemFallback'))}`).join(', ')
        const ready = o.status === 'ready'
        const busy = actingId === o.id
        return (
          <li key={o.id} className={`wt-order-row${ready ? ' is-ready' : ''}`}>
            <div className="wt-order-main">
              <span className="wt-order-state" style={{ background: s.bg, color: s.color, borderColor: s.border }}>
                {t(orderStatusLabelKey(o.status))}
              </span>
              <span className="wt-order-items">{names || t('order')}</span>
            </div>
            {canServe && ready && (
              <button type="button" className="btn btn-primary btn-sm wt-serve" disabled={busy} onClick={() => onServe(o.id)}>
                {busy ? <span className="spinner wt-spinner" /> : t('markServed')}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
