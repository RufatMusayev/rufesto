/** Loading placeholder with the final card's heights (avatar 36, photo 4:5, two caption lines). */
export default function PostSkeleton() {
  return (
    <div className="soc-post" aria-hidden="true" style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
        <div className="skeleton" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 12, width: '38%', marginBottom: 5 }} />
          <div className="skeleton" style={{ height: 9, width: '52%' }} />
        </div>
      </div>
      <div className="skeleton" style={{ width: '100%', aspectRatio: '4/5', borderRadius: 0 }} />
      <div style={{ padding: '12px 16px' }}>
        <div className="skeleton" style={{ height: 11, width: '80%', marginBottom: 7 }} />
        <div className="skeleton" style={{ height: 11, width: '55%' }} />
      </div>
    </div>
  )
}
