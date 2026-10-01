/** Suspense fallback while a lazy social page loads: skeleton rows, never a blank page. */
export default function PageFallback() {
  return (
    <div className="soc-page" aria-busy="true">
      <div className="soc-topbar"><div className="skeleton" style={{ width: 120, height: 16 }} /></div>
      <div className="soc-body">
        {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 64, marginBottom: 12, borderRadius: 12 }} />)}
      </div>
    </div>
  )
}
