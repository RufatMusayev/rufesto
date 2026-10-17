/** Placeholder rows with the final row geometry (32 px avatar, name line, two text lines): nothing moves when the reviews arrive. */
export function ReviewSkeletons({ count = 2 }) {
  return (
    <div aria-busy="true" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rv-sk">
          <div className="skeleton rv-sk-av" />
          <div className="rv-sk-lines">
            <div className="skeleton rv-sk-l1" />
            <div className="skeleton rv-sk-l2" />
            <div className="skeleton rv-sk-l3" />
          </div>
        </div>
      ))}
    </div>
  )
}
