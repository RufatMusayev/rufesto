/** A zero-state section: a 15/600 heading with an optional right-hand action, then the content. Renders nothing when empty. */
export default function Section({ title, empty, children, className = '', action = null }) {
  if (empty) return null
  return (
    <section className={`dsc-sec ${className}`.trim()}>
      <div className="dsc-head">
        <h2 className="dsc-h">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** The horizontal scroller of a rail (snap, no visible scrollbar); items are 'dsc-rail-item'. */
export function Rail({ children, label }) {
  return <div className="dsc-rail no-scrollbar" role="list" aria-label={label}>{children}</div>
}
