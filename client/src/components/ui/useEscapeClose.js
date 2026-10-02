import { useEffect, useRef } from 'react'

// Esc closes the TOPMOST open layer only. Every sheet / modal in the app calls this hook while it is
// mounted (or open); layers register in the order they opened, one document listener serves them all,
// and a keypress goes to the last one, so Esc on a sign-in modal that sits over a dish sheet closes the
// modal first and the sheet on the next press, instead of tearing both down at once.
const stack = []

function onKeyDown(e) {
  if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
  const top = stack[stack.length - 1]
  if (!top) return
  e.preventDefault()
  top.current?.()
}

export default function useEscapeClose(onClose, active = true) {
  const ref = useRef(onClose)
  ref.current = onClose

  useEffect(() => {
    if (!active) return undefined
    stack.push(ref)
    if (stack.length === 1) document.addEventListener('keydown', onKeyDown)
    return () => {
      const i = stack.lastIndexOf(ref)
      if (i >= 0) stack.splice(i, 1)
      if (!stack.length) document.removeEventListener('keydown', onKeyDown)
    }
  }, [active])
}
