// Order status display data for the dashboard, keyed by the real
// `order_status` enum: open, submitted, preparing, ready, served, paid,
// cancelled, refunded. Styles come from @shared/constants' ORDER_STATUS; the
// fallbacks below only cover an older shared map (which had a `done` key that
// is not a status and lacked submitted / paid / refunded).
import { ORDER_STATUS as SHARED_ORDER_STATUS } from '@shared/constants'

export const ORDER_STATUS_STYLE = {
  open:      SHARED_ORDER_STATUS.open,
  submitted: SHARED_ORDER_STATUS.submitted || { color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.18)' },
  preparing: SHARED_ORDER_STATUS.preparing,
  ready:     SHARED_ORDER_STATUS.ready,
  served:    SHARED_ORDER_STATUS.served,
  // `paid` is the terminal state that follows `served`.
  paid:      SHARED_ORDER_STATUS.paid || SHARED_ORDER_STATUS.done,
  cancelled: SHARED_ORDER_STATUS.cancelled,
  refunded:  SHARED_ORDER_STATUS.refunded || { color: '#A89890', bg: 'var(--s3)', border: 'var(--border)' },
}

export const ORDER_STATUS_LABEL_KEYS = {
  open: 'ordStatusOpen', submitted: 'ordStatusSubmitted', preparing: 'ordStatusPreparing',
  ready: 'ordStatusReady', served: 'ordStatusServed', paid: 'ordStatusPaid',
  cancelled: 'ordStatusCancelled', refunded: 'ordStatusRefunded',
}

/** Style for a status, falling back to `open` for anything unrecognised. */
export function orderStatusStyle(status) {
  return ORDER_STATUS_STYLE[status] || ORDER_STATUS_STYLE.open
}

/** i18n key (dashboard namespace) for a status label. */
export function orderStatusLabelKey(status) {
  return ORDER_STATUS_LABEL_KEYS[status] || ORDER_STATUS_LABEL_KEYS.open
}
