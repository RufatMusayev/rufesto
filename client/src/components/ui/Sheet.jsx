import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import useEscapeClose from './useEscapeClose'

// Bottom sheet on top of .overlay + .sheet. Closes on Esc, overlay click, the close button
// and a swipe down on the handle (>= 110px or a fast flick, same thresholds as CartSheet).
// Several sheets can stack: body.modal-open is reference counted.
let openSheets = 0

function useSwipeDismiss(onClose) {
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef({ y: 0, t: 0, id: null })

  function onPointerDown(e) {
    start.current = { y: e.clientY, t: Date.now(), id: e.pointerId }
    setDragging(true)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* not supported */ }
  }
  function onPointerMove(e) {
    if (!dragging || e.pointerId !== start.current.id) return
    let dy = e.clientY - start.current.y
    if (dy < 0) dy /= 4
    setDragY(dy)
  }
  function end(e) {
    if (!dragging || e.pointerId !== start.current.id) return
    const dy = e.clientY - start.current.y
    const dt = Date.now() - start.current.t || 1
    setDragging(false)
    setDragY(0)
    if (dy > 110 || dy / dt > 0.11) onClose()
  }

  return {
    handleProps: {
      onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end,
      style: { touchAction: 'none', cursor: 'grab', padding: '10px 0 6px' },
    },
    sheetStyle: {
      transform: dragY ? `translateY(${dragY}px)` : undefined,
      transition: dragging ? 'none' : 'transform 240ms cubic-bezier(0.23,1,0.32,1)',
    },
  }
}

export default function Sheet({ open, onClose, title, children, footer }) {
  const { t } = useTranslation('common')
  const ref = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const { handleProps, sheetStyle } = useSwipeDismiss(() => onCloseRef.current?.())
  useEscapeClose(() => onCloseRef.current?.(), open)

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    openSheets += 1
    document.body.classList.add('modal-open')
    ref.current?.focus({ preventScroll: true })
    return () => {
      openSheets = Math.max(0, openSheets - 1)
      if (openSheets === 0) document.body.classList.remove('modal-open')
      if (previous && typeof previous.focus === 'function') previous.focus({ preventScroll: true })
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div
        ref={ref}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        style={{ maxHeight: '90dvh', outline: 'none', ...sheetStyle }}
      >
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--s1)' }}>
          <div {...handleProps}><div className="sheet-handle" style={{ marginTop: 0 }} /></div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 8, padding: '8px 16px 8px',
          }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--t1)', margin: 0, lineHeight: 1.25 }}>
              {title}
            </h2>
            <button type="button" className="icon-btn" onClick={() => onClose?.()} aria-label={t('close')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        <div style={{ padding: '4px 16px 16px' }}>{children}</div>
        {footer ? (
          <div style={{
            position: 'sticky', bottom: 0, zIndex: 2, background: 'var(--s1)',
            borderTop: '1px solid var(--border)',
            padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
          }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
