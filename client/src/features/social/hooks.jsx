import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import AuthModal from '../../components/AuthModal'

/**
 * Gate for actions that need a signed-in guest. `requireAuth()` returns true when signed in;
 * otherwise it opens AuthModal and returns false. Render `authModal` once in the screen.
 * Nothing runs silently after sign-in: the guest taps again.
 */
export function useRequireAuth() {
  const { session, loading } = useAuth()
  const [open, setOpen] = useState(false)
  const requireAuth = useCallback(() => {
    if (session) return true
    setOpen(true)
    return false
  }, [session])
  const authModal = open && !session
    ? <AuthModal onClose={() => setOpen(false)} onSuccess={() => setOpen(false)} />
    : null
  return { session, authLoading: loading, requireAuth, authModal, openAuth: () => setOpen(true) }
}

/** One short status message, auto-dismissed after `ms`. `show(i18nKey, 'error' | 'info')`, e.g. 'social:errors.generic'. */
export function useToast(ms = 3500) {
  const { t } = useTranslation('social')
  const [msg, setMsg] = useState(null)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const show = useCallback((key, kind = 'error') => {
    clearTimeout(timer.current)
    setMsg({ text: t(key), kind })
    timer.current = setTimeout(() => setMsg(null), ms)
  }, [ms, t])
  const toast = msg
    ? <div className={`soc-toast soc-toast-${msg.kind}`} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</div>
    : null
  return { toast, showToast: show }
}

/** Returns `value` after it stayed unchanged for `delay` ms. */
export function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return v
}

/** BCP 47 tag for toLocaleDateString. */
export function localeTag(lng) {
  return String(lng || 'en').toLowerCase().startsWith('az') ? 'az-AZ' : 'en-GB'
}

/** Runs `fn` when the tab becomes visible again after being hidden for at least `minHiddenMs`. */
export function useOnVisible(fn, minHiddenMs = 30000) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    let hiddenAt = null
    const onChange = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
      if (hiddenAt && Date.now() - hiddenAt >= minHiddenMs) ref.current()
      hiddenAt = null
    }
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [minHiddenMs])
}
