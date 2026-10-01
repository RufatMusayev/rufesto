/** Suspense fallback while a lazy bookings page loads: skeleton blocks, never a blank page. */
export default function PageFallback() {
  return (
    <div className="bk-page" aria-busy="true">
      <div className="bk-topbar"><div className="skeleton bk-sk-title" /></div>
      <div className="bk-body">
        {[1, 2, 3].map(i => <div key={i} className="skeleton bk-sk-card" />)}
      </div>
    </div>
  )
}
