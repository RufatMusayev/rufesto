import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useEscapeClose from './useEscapeClose'
import useSheetDrag from './useSheetDrag'
import useSheetHistory from '../../lib/useSheetHistory'
import useVisualViewport from '../../lib/useVisualViewport'
import { lock } from '../../lib/scrollLock'
import './bottomSheet.css'

/**
 * The one sheet primitive of the consumer app (docs/UX-PLAN-2026-10-18.md 6.1).
 *
 *   <BottomSheet open onClose title? header? footer? size="auto"|"large" variant="sheet"|"media"
 *                dismissible initialFocus? id="dish" history labelledBy? label? className? bodyClassName? padded onClosed apiRef>
 *
 * Two ways to drive it:
 *  - controlled: pass `open`. `onClose()` is a REQUEST to close (scrim tap, Esc, drag, Back, the X); the owner
 *    sets open=false, the exit animation runs, then `onClosed()` fires and the sheet unmounts itself. Keep the
 *    component mounted and toggle `open`, or the exit has nothing to animate.
 *  - self-managed: omit `open` (`{cond && <BottomSheet onClose={...}>}`). It opens on mount; any close request runs
 *    the exit animation first and `onClose()` fires after it, when the parent can unmount.
 *
 * Props
 *  - title        string: renders the title row + X button. `header` (node) replaces that row completely (put it inside
 *                 `.bs-head`, which is draggable and touch-action:none: no scrollers in there).
 *  - footer       sticky, pads the home indicator.
 *  - size         "auto" = as tall as the content, max min(92dvh, visual viewport - 24px); "large" = always that max.
 *  - variant      "media" = black, edge to edge (photo / video viewer).
 *  - dismissible  false (busy states) turns off scrim tap, Esc, drag and Back.
 *  - history      true (default): a pushed history entry on the same URL so Android Back closes the sheet. Pass false
 *                 for a sheet whose open state is already in the URL (dish sheet `?dish=`) or an inline popover.
 *  - initialFocus ref | selector | element | () => element. Default: the panel itself.
 *  - labelledBy / label   a11y name when there is no `title`.
 *  - className    on the root `.bs-root`; bodyClassName on `.bs-body[data-bs-scroll]`, the scroller.
 *  - padded       body gets 4px 16px 16px (default); false for edge-to-edge content.
 *  - apiRef       a ref object that receives { close, navigate } (what useSheetClose / useSheetNavigate return), for the
 *                 owner of the sheet, which sits outside the sheet's own subtree.
 *
 * Inside the sheet: `useSheetClose()` closes it from a button; `useSheetNavigate()` leaves the page (replaces the
 * sheet's history entry, so Back from the new page returns to the page that was under the sheet).
 */
const SheetContext = createContext(null)
export const useSheetClose = () => useContext(SheetContext)?.close || noop
export const useSheetNavigate = () => useContext(SheetContext)?.navigate || noop
function noop() {}

// open sheets, bottom to top: everything below the top one (and the app root) is inert
const stack = []
function syncInert() {
  stack.forEach((entry, i) => {
    if (!entry.root) return
    if (i === stack.length - 1) entry.root.removeAttribute('inert')
    else entry.root.setAttribute('inert', '')
  })
  const app = document.getElementById('root')
  if (app) {
    if (stack.length) app.setAttribute('inert', '')
    else app.removeAttribute('inert')
  }
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'
const focusables = root => Array.from(root.querySelectorAll(FOCUSABLE)).filter(el => el.getClientRects().length > 0)

function resolveFocus(spec, panel) {
  const v = typeof spec === 'function' ? spec() : spec
  if (!v) return null
  if (typeof v === 'string') return panel?.querySelector(v) || document.querySelector(v)
  if ('current' in v) return v.current
  return v
}

const CLOSE_FALLBACK_MS = 450

export default function BottomSheet({
  open: openProp, onClose, onClosed,
  title, header, footer, children,
  size = 'auto', variant = 'sheet', dismissible = true, initialFocus,
  id = 'sheet', history = true, labelledBy, label,
  className = '', bodyClassName = '', padded = true, apiRef,
}) {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const titleId = useId()
  const managed = openProp === undefined
  const [selfOpen, setSelfOpen] = useState(true)
  const open = managed ? selfOpen : !!openProp
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  if (open && !mounted) setMounted(true)
  const inDom = mounted || open

  const rootRef = useRef(null)
  const panelRef = useRef(null)
  const headRef = useRef(null)
  const bodyRef = useRef(null)
  const live = useRef({})
  live.current = { managed, onClose, onClosed, dismissible, open, initialFocus }

  const closeNow = useCallback(() => {
    if (live.current.managed) setSelfOpen(false)
    else live.current.onClose?.()
  }, [])
  const requestClose = useCallback(() => { if (live.current.dismissible) closeNow() }, [closeNow])
  const canDismiss = useCallback(() => live.current.dismissible, [])
  const isOpen = useCallback(() => live.current.open, [])

  // ---- Back button ----
  const hist = useSheetHistory({
    active: open,
    enabled: history,
    id,
    onBack: () => {
      if (!live.current.dismissible) return false
      closeNow()
      return true
    },
  })
  const sheetNavigate = useCallback((to, opts = {}) => {
    const hadEntry = hist.hasEntry()
    hist.consume()
    navigate(to, { ...opts, replace: hadEntry ? true : opts.replace })
    closeNow()
  }, [hist, navigate, closeNow])
  const ctx = useMemo(() => ({ close: closeNow, navigate: sheetNavigate }), [closeNow, sheetNavigate])
  if (apiRef) apiRef.current = ctx

  // ---- enter / exit ----
  useLayoutEffect(() => {
    if (!inDom) return undefined
    const panel = panelRef.current
    if (open) {
      if (panel) {
        // a drag that was dismissed and then reopened left inline styles behind
        panel.style.transition = ''
        panel.style.transform = ''
        const scrim = rootRef.current?.querySelector('.bs-scrim')
        if (scrim) { scrim.style.transition = ''; scrim.style.opacity = '' }
        rootRef.current?.style.removeProperty('--bs-fade')
        void panel.offsetHeight // commit the closed styles first, or there is nothing to transition from
      }
      setShown(true)
      return undefined
    }
    setShown(false)
    let done = false
    const finish = () => {
      if (done) return
      done = true
      setMounted(false)
      if (live.current.managed) live.current.onClose?.()
      live.current.onClosed?.()
    }
    const onEnd = e => {
      if (e.target === panel && (e.propertyName === 'transform' || e.propertyName === 'opacity')) finish()
    }
    panel?.addEventListener('transitionend', onEnd)
    const timer = setTimeout(finish, CLOSE_FALLBACK_MS)
    return () => {
      done = true
      clearTimeout(timer)
      panel?.removeEventListener('transitionend', onEnd)
    }
  }, [open, inDom])

  // ---- while open: inert behind, scroll lock, focus in and back out ----
  useEffect(() => {
    if (!open) return undefined
    const opener = document.activeElement
    const entry = { root: rootRef.current }
    stack.push(entry)
    syncInert()
    const unlockScroll = lock()
    const target = resolveFocus(live.current.initialFocus, panelRef.current) || panelRef.current
    target?.focus({ preventScroll: true })
    return () => {
      const i = stack.indexOf(entry)
      if (i >= 0) stack.splice(i, 1)
      syncInert()
      unlockScroll()
      if (opener && opener !== document.body && typeof opener.focus === 'function' && document.contains(opener)) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [open])

  useEscapeClose(requestClose, open)
  useVisualViewport(rootRef, open)
  useSheetDrag({ active: open, panelRef, rootRef, headRef, bodyRef, canDismiss, isOpen, onDismiss: requestClose })

  function onKeyDown(e) {
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    const nodes = focusables(panel)
    if (!nodes.length) { e.preventDefault(); panel.focus(); return }
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    const at = document.activeElement
    if (!panel.contains(at) || (e.shiftKey && (at === first || at === panel))) {
      e.preventDefault()
      ;(e.shiftKey ? last : first).focus()
    } else if (!e.shiftKey && at === last) {
      e.preventDefault()
      first.focus()
    }
  }

  if (!inDom) return null

  const labelId = labelledBy || (title ? titleId : undefined)
  const head = header ?? (title ? (
    <div className="bs-title-row">
      <h2 className="bs-title" id={titleId}>{title}</h2>
      <button type="button" className="icon-btn" onClick={requestClose} aria-label={t('close')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  ) : null)

  return createPortal(
    <SheetContext.Provider value={ctx}>
      <div
        ref={rootRef}
        className={`bs-root${className ? ` ${className}` : ''}`}
        data-state={open && shown ? 'open' : 'closed'}
        data-size={size}
        data-variant={variant}
      >
        <div className="bs-scrim" onClick={requestClose} aria-hidden="true" />
        <div
          ref={panelRef}
          className="bs-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelId}
          aria-label={labelId ? undefined : label}
          tabIndex={-1}
          onKeyDown={onKeyDown}
        >
          <div ref={headRef} className="bs-head">
            <div className="bs-grab" aria-hidden="true" />
            {head}
          </div>
          <div
            ref={bodyRef}
            className={`bs-body${padded ? ' bs-padded' : ''}${footer ? '' : ' bs-nofoot'}${bodyClassName ? ` ${bodyClassName}` : ''}`}
            data-bs-scroll=""
          >
            {children}
          </div>
          {footer ? <div className="bs-foot">{footer}</div> : null}
        </div>
      </div>
    </SheetContext.Provider>,
    document.body,
  )
}
