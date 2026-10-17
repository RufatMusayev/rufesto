/** One 64 px row skeleton (the final geometry of a place or dish row, so nothing shifts when the data lands). */
export function RowSkeleton({ n = 3 }) {
  return Array.from({ length: n }, (_, i) => (
    <div key={i} className="sr-row sr-row-sk" aria-hidden="true">
      <div className="skeleton sr-thumb" />
      <div className="sr-main">
        <div className="skeleton sr-sk-line sr-sk-w60" />
        <div className="skeleton sr-sk-line sr-sk-w40" />
      </div>
    </div>
  ))
}

/** Loading state of the Search zero state: a chip row, one rail and a few rows, in the geometry of the final sections. */
export default function DiscoverSkeleton() {
  return (
    <div className="dsc-sk" aria-busy="true" aria-hidden="true">
      <div className="dsc-sec">
        <div className="skeleton dsc-sk-h" />
        <div className="dsc-rail dsc-rail-sk">
          {[1, 2, 3].map(i => (
            <div key={i} className="dsc-rail-item">
              <div className="skeleton dsc-sk-photo" />
              <div className="skeleton dsc-sk-line dsc-sk-w70" />
            </div>
          ))}
        </div>
      </div>
      <div className="dsc-sec">
        <div className="skeleton dsc-sk-h" />
        <RowSkeleton n={4} />
      </div>
    </div>
  )
}
