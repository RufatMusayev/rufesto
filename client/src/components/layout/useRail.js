import { useEffect, useState } from 'react'

/** True from 1024 px: the left rail replaces the bottom nav (docs/UX-PLAN-2026-10-18.md D10). Tablets keep the phone layout. */
const QUERY = '(min-width: 1024px)'

export default function useRail() {
  const [rail, setRail] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const on = () => setRail(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return rail
}
