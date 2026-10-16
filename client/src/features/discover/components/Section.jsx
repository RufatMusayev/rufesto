/** A Discover section: serif heading + content. Renders nothing when there is nothing to show. */
export default function Section({ title, empty, children, className = '' }) {
  if (empty) return null
  return (
    <section className={`dsc-sec ${className}`.trim()}>
      <h2 className="dsc-h">{title}</h2>
      {children}
    </section>
  )
}

/** The horizontal scroller of a rail (snap, no visible scrollbar); items are 'dsc-rail-item'. */
export function Rail({ children, label }) {
  return <div className="dsc-rail no-scrollbar" role="list" aria-label={label}>{children}</div>
}
