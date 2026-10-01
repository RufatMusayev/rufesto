/** Suspense fallback while a lazy bills page loads: skeleton blocks, never a blank page. */
export default function PageFallback() {
  return (
    <div className="bl-page" aria-busy="true">
      <div className="bl-topbar"><div className="skeleton bl-sk-title" /></div>
      <div className="bl-body">
        {[1, 2, 3].map(i => <div key={i} className="skeleton bl-sk-card" />)}
      </div>
    </div>
  )
}
