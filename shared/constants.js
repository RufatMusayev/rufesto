export const TABLE_COLORS = {
  free:              { label: 'Free',         color: '#3B6D11', bg: 'rgba(59,109,17,0.12)',   border: 'rgba(59,109,17,0.25)' },
  reserved:          { label: 'Reserved',     color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.25)' },
  occupied:          { label: 'Occupied',     color: '#8B2D42', bg: 'rgba(139,45,66,0.12)',   border: 'rgba(139,45,66,0.25)' },
  ordering:          { label: 'Ordering',     color: '#BA7517', bg: 'rgba(186,117,23,0.12)',  border: 'rgba(186,117,23,0.25)' },
  awaiting_payment:  { label: 'Awaiting Pay', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)' },
  cleared:           { label: 'Cleared',      color: '#6B5E56', bg: 'rgba(107,94,86,0.08)',   border: 'rgba(107,94,86,0.15)' },
}

export const ORDER_STATUS = {
  open:      { label: 'Open',      color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.18)' },
  preparing: { label: 'Preparing', color: '#BA7517', bg: 'rgba(186,117,23,0.08)',  border: 'rgba(186,117,23,0.18)' },
  ready:     { label: 'Ready',     color: '#3B6D11', bg: 'rgba(59,109,17,0.08)',   border: 'rgba(59,109,17,0.18)' },
  served:    { label: 'Served',    color: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.18)' },
  done:      { label: 'Done',      color: '#6B5E56', bg: 'var(--s3)',              border: 'var(--border)' },
  cancelled: { label: 'Cancelled', color: '#A32D2D', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.18)' },
}

export const TABLE_STATE_TRANSITIONS = {
  free:              ['reserved', 'occupied'],
  reserved:          ['occupied', 'free'],
  occupied:          ['ordering', 'free'],
  ordering:          ['awaiting_payment', 'occupied'],
  awaiting_payment:  ['cleared'],
  cleared:           ['free'],
}

export const KDS_STATUS = {
  new:       { label: 'NEW',  color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  next: 'preparing', action: 'Start Preparing' },
  preparing: { label: 'PREP', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  next: 'ready',     action: 'Mark Ready' },
  ready:     { label: 'READY', color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  next: 'done',      action: 'Done' },
}

export const BOOKING_STATUS_STYLE = {
  pending:   { bg: 'rgba(245,158,11,0.08)', color: 'var(--accent)' },
  confirmed: { bg: 'rgba(34,197,94,0.08)',  color: 'var(--green)' },
  seated:    { bg: 'rgba(59,130,246,0.08)', color: 'var(--blue)' },
  completed: { bg: 'var(--s3)',             color: 'var(--t3)' },
  cancelled: { bg: 'rgba(239,68,68,0.08)', color: 'var(--red)' },
}
