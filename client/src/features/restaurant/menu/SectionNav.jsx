import { useEffect, useRef } from 'react'

/**
 * Sticky section navigator under the tab bar: horizontal chips that follow the scroll (scroll-spy) and jump to a
 * section on tap, plus a button that takes the guest to the search field. `items`: [{ key, title, icon? }].
 */
export default function SectionNav({ items, active, onJump, onSearch, label, searchLabel }) {
  const row = useRef(null)

  // keep the active chip in view without ever moving the page itself
  useEffect(() => {
    const box = row.current
    const chip = box?.querySelector('[aria-current="true"]')
    if (!box || !chip) return
    const left = chip.offsetLeft - (box.clientWidth - chip.offsetWidth) / 2
    box.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }, [active])

  return (
    <nav className="mn-nav" aria-label={label}>
      <div className="mn-nav-in">
        <div className="mn-chips" ref={row}>
          {items.map(it => (
            <button
              key={it.key}
              type="button"
              className="mn-chip"
              aria-current={it.key === active ? 'true' : undefined}
              onClick={() => onJump(it.key)}
            >
              {it.icon && <span className="mn-chip-icon" aria-hidden="true">{it.icon}</span>}
              <span className="mn-chip-text">{it.title}</span>
            </button>
          ))}
        </div>
        <button type="button" className="mn-nav-search" onClick={onSearch} aria-label={searchLabel}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" />
          </svg>
        </button>
      </div>
    </nav>
  )
}
