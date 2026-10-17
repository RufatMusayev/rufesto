/** First-paint placeholder of the restaurant page (header + tab bar + a grid), same geometry as the real page. */
export default function PageSkeleton() {
  return (
    <div className="rst-page" aria-busy="true">
      <div className="rst-cover skeleton" />
      <div className="rst-col">
        <div className="rst-id">
          <div className="rst-logo skeleton" />
          <div className="rst-stats">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="rst-stat">
                <div className="skeleton rst-sk-n" />
                <div className="skeleton rst-sk-l" />
              </div>
            ))}
          </div>
        </div>
        <div className="skeleton rst-sk-name" />
        <div className="skeleton rst-sk-meta" />
        <div className="rst-actions">
          <div className="skeleton rst-sk-btn" />
          <div className="skeleton rst-sk-btn" />
        </div>
      </div>
      <div className="rst-tabs rst-tabs--sk" />
      <div className="rst-grid rst-grid--sk">
        {Array.from({ length: 9 }, (_, i) => <div key={i} className="rst-tile skeleton" />)}
      </div>
    </div>
  )
}
