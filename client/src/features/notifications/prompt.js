// The two contextual "ask for push" moments (docs/V2-CONTRACT.md section 21.4): right after a guest's first order is
// placed ('order': "Get notified when your food is ready?") and right after a booking is created ('booking': "Remind me
// 1 hour before?"). Never on first load, and each kind at most once per device.
//
// Call sites do exactly one thing and never wait for it:
//   import('../features/notifications/prompt').then(m => m.maybeAskForPush('order')).catch(() => {})
// maybeAskForPush decides; NotificationsHost (mounted once in AppLayout) draws the prompt when the event arrives.
import { supabase } from '../../lib/supabase'
import { getPushState } from './push'
import { PROMPT_EVENT } from './events'

const flag = kind => `rufesto_push_prompt_${kind}`
const SHOW_AFTER_MS = 1200      // the order / booking confirmation gets a moment of its own first

/** True once the prompt of this kind has been shown on this device (or storage is blocked, so it could not be remembered). */
export function wasPrompted(kind) {
  try { return localStorage.getItem(flag(kind)) === '1' } catch { return true }
}

/** Remembered the moment the prompt is shown, whatever the guest answers: it never comes back on this device. */
export function rememberPrompted(kind) {
  try { localStorage.setItem(flag(kind), '1') } catch { /* nothing to remember with */ }
}

/**
 * Ask to turn push on, if it makes sense: signed in, push possible on this device, permission not blocked, not on yet,
 * and this kind not shown before. Resolves true when the prompt was scheduled. Never throws.
 */
export async function maybeAskForPush(kind) {
  try {
    if (kind !== 'order' && kind !== 'booking') return false
    if (wasPrompted(kind)) return false
    const { data } = await supabase.auth.getSession()
    if (!data.session) return false
    const state = await getPushState()
    if (state.status !== 'off') return false
    window.setTimeout(() => window.dispatchEvent(new CustomEvent(PROMPT_EVENT, { detail: { kind } })), SHOW_AFTER_MS)
    return true
  } catch { return false }
}
