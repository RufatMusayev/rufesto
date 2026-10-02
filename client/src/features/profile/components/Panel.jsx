import LoadError from '../../../components/LoadError'

/** Skeleton rows with the final row height, 64px or 88px when `tall` (no layout shift). */
export function RowSkeletons({ count = 3, tall = false }) {
  return (
    <div className="pf-list" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`skeleton pf-sk-row${tall ? ' pf-sk-tall' : ''}`} />
      ))}
    </div>
  )
}

export function GridSkeleton({ count = 9 }) {
  return (
    <div className="explore-grid pf-grid" aria-busy="true">
      {Array.from({ length: count }, (_, i) => <div key={i} className="skeleton pf-tile pf-tile-sk" />)}
    </div>
  )
}

/**
 * Loading -> skeleton, failed -> LoadError with retry, no rows -> `empty`, else `children(rows)`.
 * `resource` is one entry of useProfileData.
 */
export default function Panel({ resource, skeleton, empty, children }) {
  if (resource.status === 'idle' || resource.status === 'loading') return skeleton
  if (resource.status === 'error') return <LoadError onRetry={resource.reload} />
  if (!resource.data || resource.data.length === 0) return empty
  return children(resource.data)
}
