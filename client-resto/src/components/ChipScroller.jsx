import { useCallback, useEffect, useRef, useState } from 'react'

// A row of chips that scrolls sideways when it does not fit (a phone): a fade with an arrow marks each edge that
// has more chips behind it, the same hint the bottom bar uses. `aria-label` makes the row a labelled group.
// Styles: .chipscroll in features/v2/ops.css.
export default function ChipScroller({ children, className = '', ...rest }) {
  const trackRef = useRef(null)
  const [more, setMore] = useState({ left: false, right: false })

  const measure = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const left = el.scrollLeft > 4
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
    setMore(prev => (prev.left === left && prev.right === right ? prev : { left, right }))
  }, [])

  // Re-measure when the chips change (counts, optional chips appearing) and when the box is resized.
  useEffect(() => {
    const el = trackRef.current
    if (!el) return undefined
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])
  useEffect(measure)

  const cls = ['chipscroll', more.left && 'has-more-left', more.right && 'has-more-right', className].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      <div className="chipscroll-track" ref={trackRef} onScroll={measure} {...rest}>{children}</div>
    </div>
  )
}
