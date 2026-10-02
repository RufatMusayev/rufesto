import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Behaviour of a modal dialog, for the element that carries role="dialog" (put the returned ref on it):
 * focus moves into it on open, Tab / Shift+Tab stay inside it, Escape calls `onClose`, the page behind does not
 * scroll (body.modal-open), and focus goes back to what opened it on close.
 * `onClose` may change on every render; the latest one is used.
 */
export default function useDialog(onClose) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const node = ref.current
    const opener = document.activeElement
    document.body.classList.add('modal-open')

    const focusables = () => [...(node?.querySelectorAll(FOCUSABLE) || [])].filter(el => el.offsetParent !== null || el === document.activeElement)
    // Focus lands on the dialog itself (announced with its label); Tab then goes to the first control. Putting it
    // on the first field would open the on-screen keyboard on a phone.
    if (node) {
      if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1')
      node.focus({ preventScroll: true })
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current?.()
        return
      }
      if (e.key !== 'Tab' || !node) return
      const items = focusables()
      if (items.length === 0) { e.preventDefault(); node.focus(); return }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      const active = document.activeElement
      if (!node.contains(active)) { e.preventDefault(); firstEl.focus() }
      else if (e.shiftKey && (active === firstEl || active === node)) { e.preventDefault(); lastEl.focus() }
      else if (!e.shiftKey && active === lastEl) { e.preventDefault(); firstEl.focus() }
    }
    document.addEventListener('keydown', onKey, true)

    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.classList.remove('modal-open')
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus()
    }
  }, [])

  return ref
}
