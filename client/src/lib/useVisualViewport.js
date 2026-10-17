import { useLayoutEffect } from 'react'

// Writes the visual viewport (the part of the page not covered by the on-screen keyboard) into two CSS variables on
// `ref.current`: --vvh (height) and --vv-top (offset from the layout viewport top, non-zero on iOS Safari while the
// keyboard is open). BottomSheet's root and panel max-height read them, so a pinned composer follows the keyboard.
// Skipped while the guest is pinch-zoomed.
export default function useVisualViewport(ref, active = true) {
  useLayoutEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    const el = ref.current
    if (!active || !vv || !el) return undefined
    let raf = 0
    const write = () => {
      raf = 0
      if (vv.scale > 1.01) return
      el.style.setProperty('--vvh', `${Math.round(vv.height)}px`)
      el.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`)
    }
    const queue = () => { if (!raf) raf = requestAnimationFrame(write) }
    write()
    vv.addEventListener('resize', queue)
    vv.addEventListener('scroll', queue)
    return () => {
      vv.removeEventListener('resize', queue)
      vv.removeEventListener('scroll', queue)
      if (raf) cancelAnimationFrame(raf)
      el.style.removeProperty('--vvh')
      el.style.removeProperty('--vv-top')
    }
  }, [ref, active])
}
