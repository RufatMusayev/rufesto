import { useCallback, useEffect, useRef, useState } from 'react'
import { getPrefs, setPrefs, PREF_DEFAULTS } from './api'

export const QUIET_DEFAULT = { quiet_from: '22:00', quiet_to: '08:00' }
const SAVED_FLASH_MS = 2000
const TIME_DEBOUNCE_MS = 500

/**
 * The guest's notification preferences, saved as they change (no Save button).
 *  load: 'loading' | 'ready' | 'missing' (sql/64 not applied: the toggles are disabled) | 'error'
 *  save: 'idle' | 'saved' | 'error'
 * change(patch) updates the screen at once and sends the patch; a failed save puts the old values back.
 * Quiet hours always travel as a pair (both times, or both null), the rule the RPC enforces.
 */
export default function usePrefs() {
  const [prefs, setLocal] = useState(PREF_DEFAULTS)
  const [load, setLoad] = useState('loading')
  const [save, setSave] = useState('idle')
  const flash = useRef(null)
  const debounce = useRef(null)
  const last = useRef(PREF_DEFAULTS)           // what the server is known to hold

  useEffect(() => {
    let alive = true
    getPrefs().then(({ data, error }) => {
      if (!alive) return
      if (error) { setLoad(error.missing ? 'missing' : 'error'); return }
      last.current = data
      setLocal(data)
      setLoad('ready')
    })
    return () => { alive = false; clearTimeout(flash.current); clearTimeout(debounce.current) }
  }, [])

  const send = useCallback(async patch => {
    clearTimeout(flash.current)
    const { error } = await setPrefs(patch)
    if (error) {
      setLocal(last.current)
      setSave('error')
      return false
    }
    last.current = { ...last.current, ...patch }
    setSave('saved')
    flash.current = setTimeout(() => setSave('idle'), SAVED_FLASH_MS)
    return true
  }, [])

  const change = useCallback(patch => {
    setLocal(p => ({ ...p, ...patch }))
    // a time being typed: wait for the finger to stop before saving the pair
    if ('quiet_from' in patch && 'quiet_to' in patch && patch.quiet_from && patch.quiet_to) {
      clearTimeout(debounce.current)
      debounce.current = setTimeout(() => send(patch), TIME_DEBOUNCE_MS)
      return
    }
    send(patch)
  }, [send])

  /** Re-read after something outside this hook changed a pref (the push switch sets push_enabled). */
  const reload = useCallback(async () => {
    const { data } = await getPrefs()
    if (data) { last.current = data; setLocal(data) }
  }, [])

  return { prefs, load, save, change, reload }
}
