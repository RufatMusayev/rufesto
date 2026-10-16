const CHIP_WIDTHS = ['w64', 'w84', 'w72', 'w92']

function RailSkeleton({ kind }) {
  return (
    <div className="dsc-sec">
      <div className="skeleton dsc-sk-h" />
      <div className="dsc-rail dsc-rail-sk">
        {[1, 2, 3].map(i => (
          <div key={i} className={`dsc-rail-item dsc-rail-${kind}`}>
            <div className={`skeleton dsc-sk-photo dsc-sk-photo-${kind}`} />
            <div className="skeleton dsc-sk-line dsc-sk-w70" />
            <div className="skeleton dsc-sk-line dsc-sk-w45" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Loading state of the Discover tab: chips, two rails and the first list card, in the geometry of the final
 * sections (no layout shift when the answer lands). `withChips` is false while only a chip's answer loads.
 */
export default function DiscoverSkeleton({ withChips = true }) {
  return (
    <div className="dsc-sk" aria-busy="true" aria-hidden="true">
      {withChips && (
        <div className="dsc-chips">
          {CHIP_WIDTHS.map(w => <div key={w} className={`skeleton dsc-sk-chip dsc-sk-${w}`} />)}
        </div>
      )}
      <RailSkeleton kind="rest" />
      <RailSkeleton kind="dish" />
      <div className="dsc-sec">
        <div className="skeleton dsc-sk-h" />
        <div className="dsc-list">
          <div className="dsc-rc dsc-rc-list">
            <div className="skeleton dsc-sk-photo dsc-sk-photo-list" />
            <div className="dsc-rc-body">
              <div className="skeleton dsc-sk-line dsc-sk-w60" />
              <div className="skeleton dsc-sk-line dsc-sk-w45" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The same skeleton as a whole tab (the Suspense fallback while the Discover chunk loads). */
export function DiscoverFallback() {
  return <div className="dsc soc-feed"><DiscoverSkeleton /></div>
}
