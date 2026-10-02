/** Shown while the session is being restored: same blocks and heights as ProfileHeader. */
export default function HeaderSkeleton() {
  return (
    <div className="card pf-head" aria-busy="true">
      <div className="pf-cover" aria-hidden="true" />
      <div className="pf-head-body" aria-hidden="true">
        <div className="pf-avatar"><div className="skeleton pf-sk-avatar" /></div>
        <div className="skeleton pf-sk-name" />
        <div className="skeleton pf-sk-pill" />
        <div className="skeleton pf-sk-stats" />
        <div className="skeleton pf-sk-actions" />
      </div>
    </div>
  )
}
