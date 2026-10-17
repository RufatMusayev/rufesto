import usePullToRefresh from '../../lib/usePullToRefresh'
import './pullToRefresh.css'

/**
 * Pull to refresh for a page or a tab (docs/UX-PLAN-2026-10-18.md 6.6). Touch screens only, from scrollY 0.
 *
 *   <PullToRefresh onRefresh={() => store.refresh()} enabled={active}>...the list...</PullToRefresh>
 *
 * `onRefresh` may return a promise: the spinner keeps turning until it settles (at least 400 ms). Pass
 * `enabled={false}` for a tab that is hidden. The wrapper adds no layout of its own.
 */
export default function PullToRefresh({ onRefresh, enabled = true, className = '', children }) {
  const { rootRef, bodyRef, indicatorRef } = usePullToRefresh({ onRefresh, enabled })
  return (
    <div ref={rootRef} className={`ptr${className ? ` ${className}` : ''}`}>
      <div ref={indicatorRef} className="ptr-indicator" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle className="ptr-track" cx="14" cy="14" r="10" strokeWidth="2.5" />
          <path className="ptr-arc" d="M14 4a10 10 0 0 1 10 10" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
      <div ref={bodyRef} className="ptr-body">{children}</div>
    </div>
  )
}
