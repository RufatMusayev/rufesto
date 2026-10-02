// Every value of the order_status enum (sql/_prod_baseline.sql): open, submitted, preparing, ready, served, paid,
// cancelled, refunded. The server keeps `orders.status` in step with the kitchen tickets (sql/53), so the guest
// sees Preparing / Ready live. Labels live in the `table` namespace (en + az).
const VIEW = {
  open:      { label: 'statusPlaced',    tone: 'blue',  step: 0 },
  submitted: { label: 'statusSubmitted', tone: 'blue',  step: 0 },
  preparing: { label: 'statusPreparing', tone: 'amber', step: 1 },
  ready:     { label: 'statusReady',     tone: 'green', step: 2 },
  served:    { label: 'statusServed',    tone: 'green', step: 3 },
  paid:      { label: 'statusPaid',      tone: 'gray',  step: 3 },
  cancelled: { label: 'statusCancelled', tone: 'red',   step: -1 },
  refunded:  { label: 'statusRefunded',  tone: 'red',   step: -1 },
}

/** The four stops of an order, in order. `label` is the same key as the status badge. */
export const TIMELINE_STEPS = ['statusPlaced', 'statusPreparing', 'statusReady', 'statusServed']

/** { label, tone, step } of a status; an unknown value reads as freshly placed. step -1 = off the timeline. */
export const statusView = status => VIEW[status] || VIEW.open

/** Statuses a guest still follows on the table screen; paid / refunded orders belong to an earlier bill. */
export const LIVE_STATUSES = ['open', 'submitted', 'preparing', 'ready', 'served']
