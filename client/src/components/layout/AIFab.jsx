import { useState, useEffect } from 'react'
import { useCart } from '../../contexts/CartContext'
import AIChatSheet from '../AIChatSheet'

export default function AIFab() {
  const { tableId } = useCart()
  const [open, setOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  // Stack above the cart FAB (52px + gap) whenever a table session is active.
  const baseBottom = isMobile ? 'calc(var(--bottom-h) + 0.75rem)' : '1.5rem'
  const bottom = tableId ? `calc(${baseBottom} + 62px)` : baseBottom

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Ask Rufesto AI"
        title="Ask Rufesto AI"
        style={{
          position: 'fixed',
          right: '1rem',
          bottom,
          width: 52, height: 52, borderRadius: '50%',
          background: 'var(--brand-gradient)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 80,
          boxShadow: '0 4px 18px rgba(196,154,44,0.4)',
          transition: 'transform 200ms cubic-bezier(0.23,1,0.32,1), bottom 200ms ease',
        }}
        onPointerDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
        onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
        onPointerCancel={e => e.currentTarget.style.transform = 'scale(1)'}
        onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#F5F0E8">
          <path d="M12 2.5l1.7 4.8a3 3 0 0 0 1.9 1.9L20.5 11l-4.9 1.8a3 3 0 0 0-1.9 1.9L12 19.5l-1.7-4.8a3 3 0 0 0-1.9-1.9L3.5 11l4.9-1.8a3 3 0 0 0 1.9-1.9L12 2.5z" />
          <path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" opacity="0.85" />
        </svg>
      </button>

      {open && <AIChatSheet onClose={() => setOpen(false)} />}
    </>
  )
}
