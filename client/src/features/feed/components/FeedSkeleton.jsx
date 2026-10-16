/** Loading placeholder with the final post card's geometry (avatar row, 4:5 photo, two caption lines): no layout shift. */
export default function FeedSkeleton() {
  return (
    <div className="soc-post soc-sk" aria-hidden="true">
      <div className="soc-sk-head">
        <div className="skeleton soc-sk-avatar" />
        <div className="soc-sk-lines">
          <div className="skeleton soc-sk-line soc-sk-w38" />
          <div className="skeleton soc-sk-line soc-sk-w52" />
        </div>
      </div>
      <div className="skeleton soc-sk-photo" />
      <div className="soc-sk-body">
        <div className="skeleton soc-sk-line soc-sk-w80" />
        <div className="skeleton soc-sk-line soc-sk-w55" />
      </div>
    </div>
  )
}

/** The loading state of a tab: a few skeleton cards. */
export function FeedSkeletons({ count = 2 }) {
  return (
    <div aria-busy="true">
      {Array.from({ length: count }, (_, i) => <FeedSkeleton key={i} />)}
    </div>
  )
}
