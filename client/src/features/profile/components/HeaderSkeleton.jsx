/** Shown while the session is being restored: same blocks and heights as ProfileHeader. */
export default function HeaderSkeleton() {
  return (
    <div aria-busy="true">
      <div className="pf-bar" aria-hidden="true"><div className="skeleton pf-sk-name" /></div>
      <div className="card pf-head">
        <div className="pf-cover" aria-hidden="true" />
        <div className="pf-head-body" aria-hidden="true">
          <div className="pf-avatar"><div className="skeleton pf-sk-avatar" /></div>
          <div className="skeleton pf-sk-stats" />
          <div className="skeleton pf-sk-actions" />
        </div>
      </div>
    </div>
  )
}
