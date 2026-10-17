import { useTranslation } from 'react-i18next'
import { formatPrice, timeAgo } from '@shared/helpers'
import { orderStatusLabelKey, orderStatusStyle } from '../../lib/orderStatus'

// The facts a waiter needs at a glance on a table card: guests, what the kitchen is doing with the order, the amount
// still due, how long ago the order was placed, and open calls. The same lines on My Tables and All Tables.
//   table  one entry of waiter_overview().tables
//   facts  { status, oldest } from summariseTableOrders(), undefined when the table has no live order
export default function TableFacts({ table, facts }) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const openCalls = (table.requests || []).filter(r => r.status === 'open' || r.status === 'acknowledged').length
  const s = facts ? orderStatusStyle(facts.status) : null

  return (
    <div className="wt-facts">
      <span>{t('dashboard:bookingGuests', { count: table.guests })}</span>
      {table.pending_guests > 0 && (
        <span className="wt-fact--gold">{t('dashboard:waiterPendingGuests', { count: table.pending_guests })}</span>
      )}
      {facts && (
        <span className="wt-order">
          <span className="wt-order-state" style={{ background: s.bg, color: s.color, borderColor: s.border }}>
            {t(`dashboard:${orderStatusLabelKey(facts.status)}`)}
          </span>
          {facts.oldest && <span className="wt-age">{t('dashboard:waiterOrderedAgo', { ago: timeAgo(facts.oldest, i18n.language) })}</span>}
        </span>
      )}
      {table.outstanding > 0 && (
        <span className="wt-due">{t('dashboard:waiterOutstanding', { amount: formatPrice(table.outstanding) })}</span>
      )}
      {openCalls > 0 && (
        <span className="wt-fact--red">{t('dashboard:waiterOpenCalls', { count: openCalls })}</span>
      )}
    </div>
  )
}
