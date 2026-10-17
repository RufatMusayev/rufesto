import { useEffect, useRef, useState } from 'react'

// Overflow ("...") menu of a bill card for the actions that must not sit next to the settle buttons, e.g. Void.
// `items` = [{ key, label, danger, onSelect }]. Esc and a click outside close it; the first item takes focus.
export default function BillMenu({ label, items }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    rootRef.current?.querySelector('[role="menuitem"]')?.focus()
    const onPointer = e => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    const onKey = e => {
      if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus() }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="v2-menu" ref={rootRef}>
      <button ref={buttonRef} type="button" className="v2-icon-btn v2-menu-btn" aria-haspopup="menu" aria-expanded={open}
        aria-label={label} title={label} onClick={() => setOpen(o => !o)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {open && (
        <div className="v2-menu-list" role="menu">
          {items.map(item => (
            <button key={item.key} type="button" role="menuitem"
              className={`v2-menu-item${item.danger ? ' v2-menu-item--danger' : ''}`}
              onClick={() => { setOpen(false); item.onSelect() }}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
