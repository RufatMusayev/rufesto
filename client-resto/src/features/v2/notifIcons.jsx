// Icons of the staff notifications (bell, one per notification kind). Same stroke style as icons.jsx.
const props = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

export function BellIcon() {
  return <svg {...props}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0" /></svg>
}

function BillKind() {
  return <svg {...props}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></svg>
}

// a service bell (cloche on a base): the guest called the waiter
function WaiterKind() {
  return <svg {...props}><path d="M4 17a8 8 0 0 1 16 0z" /><path d="M2.5 20h19M12 9V7M10 7h4" /></svg>
}

function JoinKind() {
  return <svg {...props}><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M19 8v6M16 11h6" /></svg>
}

function BookingKind() {
  return <svg {...props}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18M16 2v4M8 2v4M12 14v4M10 16h4" /></svg>
}

function ReviewKind() {
  return <svg {...props}><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" /></svg>
}

function StockKind() {
  return <svg {...props}><path d="M21 8l-9-5-9 5v8l9 5 9-5z" /><path d="M3.3 8L12 13l8.7-5M12 13v8" /></svg>
}

function GenericKind() {
  return <BellIcon />
}

const BY_KIND = { bill: BillKind, waiter: WaiterKind, join: JoinKind, booking: BookingKind, review: ReviewKind, stock: StockKind }

export function KindIcon({ kind }) {
  const Icon = BY_KIND[kind] || GenericKind
  return <Icon />
}
