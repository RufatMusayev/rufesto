/** Loading layout of the bill page: 3 person cards + the totals card, same heights as the real ones. */
export default function BillSkeleton() {
  return (
    <div className="bl-body" aria-busy="true" aria-hidden="true">
      <div className="skeleton bl-sk-line" />
      {[1, 2, 3].map(i => <div key={i} className="skeleton bl-sk-card" />)}
      <div className="skeleton bl-sk-totals" />
    </div>
  )
}
