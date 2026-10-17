import { useCallback, useEffect, useId, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// Android Back / browser Back closes the top sheet instead of leaving the page (docs/UX-PLAN-2026-10-18.md 6.1).
//  - open:  push one history entry on the SAME url whose state carries `sheets: [...keys]`;
//  - Back:  the router reports a location that no longer has our key -> `onBack()` closes the sheet (animated);
//           return false from it to refuse (a non-dismissible sheet): the entry is pushed again;
//  - close by UI (scrim, X, Esc, drag, a button): the entry is on top, so it is popped with navigate(-1);
//  - leaving the page from inside a sheet: use `consume()` + `replace: true` (BottomSheet's useSheetNavigate does
//    both), so Back from the new page returns to the page that was under the sheet.
// The pop is deferred by a tick: React StrictMode runs every effect twice in development (cleanup + setup), which
// must not turn into "push, go back, push".

// keys of the sheets that own a history entry right now (see useSheetGhostSkip)
const activeKeys = new Set()

// react-router keeps the location state under history.state.usr; reading it there gives the value of a push that
// has happened but not rendered yet, and never a stale one
const stateSheets = () => {
  try {
    const s = window.history.state?.usr?.sheets
    return Array.isArray(s) ? s : []
  } catch {
    return []
  }
}

export default function useSheetHistory({ active, enabled = true, id = 'sheet', onBack }) {
  const key = `${id}:${useId()}`
  const location = useLocation()
  const navigate = useNavigate()
  const live = useRef({})
  live.current = { location, navigate, key, on: !!(active && enabled), onBack }
  const pushed = useRef(false) // our entry was pushed and is neither popped nor replaced
  const seen = useRef(false) // the router has reported our key at least once
  const alive = useRef(false)
  const timer = useRef(0)

  const present = Array.isArray(location.state?.sheets) && location.state.sheets.includes(key)

  const push = useCallback(() => {
    const { location: loc, navigate: go, key: k } = live.current
    const base = window.history.state?.usr && typeof window.history.state.usr === 'object' ? window.history.state.usr : (loc.state || {})
    go(
      { pathname: loc.pathname, search: loc.search, hash: loc.hash },
      { state: { ...base, sheets: [...stateSheets(), k] } },
    )
    pushed.current = true
    activeKeys.add(k)
  }, [])

  // open: push our entry once; close / unmount: pop it unless Back or a replace already consumed it
  useEffect(() => {
    if (!active || !enabled) return undefined
    alive.current = true
    clearTimeout(timer.current)
    if (!pushed.current) { seen.current = false; push() }
    return () => {
      alive.current = false
      timer.current = setTimeout(() => {
        if (alive.current && live.current.on) return // StrictMode re-run, or the sheet is still open
        if (!pushed.current) return
        pushed.current = false
        seen.current = false
        activeKeys.delete(live.current.key)
        const sheets = stateSheets()
        if (sheets[sheets.length - 1] === live.current.key) live.current.navigate(-1)
      }, 0)
    }
  }, [active, enabled, push])

  // Back: our key disappeared from the location after it had been there
  useEffect(() => {
    if (!active || !enabled) return
    if (present) { seen.current = true; return }
    if (seen.current && pushed.current) {
      seen.current = false
      pushed.current = false
      activeKeys.delete(live.current.key)
      if (live.current.onBack?.() === false) push()
    }
  }, [present, active, enabled, push])

  const hasEntry = useCallback(() => pushed.current && stateSheets()[stateSheets().length - 1] === live.current.key, [])
  /** The caller is about to replace or leave the entry: do not pop it on close. */
  const consume = useCallback(() => { pushed.current = false; seen.current = false; activeKeys.delete(live.current.key) }, [])
  // hasEntry(): our entry is the top one
  return useMemo(() => ({ hasEntry, consume }), [hasEntry, consume])
}

/**
 * Call once in the app shell. A sheet's history entry that outlives the sheet (the owner navigated away with a plain
 * push, or the guest pressed Forward) would cost one dead Back tap: the URL is the same, nothing shows. When the guest
 * lands on such an entry by Back / Forward, this keeps going in the same direction. A reload on such an entry strips it.
 */
export function useSheetGhostSkip() {
  const location = useLocation()
  const navigate = useNavigate()
  const prevIdx = useRef(null)
  useEffect(() => {
    const idx = window.history.state?.idx ?? 0
    const first = prevIdx.current === null
    const dir = first ? 0 : idx - prevIdx.current
    prevIdx.current = idx
    const sheets = location.state?.sheets
    if (!Array.isArray(sheets) || !sheets.length || sheets.some(k => activeKeys.has(k))) return
    if (first) {
      const { sheets: _gone, ...rest } = location.state
      navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: rest })
    } else if (dir !== 0) {
      window.history.go(dir < 0 ? -1 : 1)
    }
  }, [location, navigate])
}
