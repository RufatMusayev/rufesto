import { supabase } from './supabase'

// Postgres-changes channels can quietly stop delivering:
//   - a binding on a table that isn't in the supabase_realtime publication yet
//     fails the whole channel (CHANNEL_ERROR), taking the other bindings with it;
//   - the socket drops (TIMED_OUT / CLOSED) and events during the gap are lost;
//   - DELETE events are not delivered for filtered subscriptions under RLS, so a
//     row another staff member deletes (a dish, a table_service claim) never
//     arrives.
// Pages therefore keep their normal debounced refetch on events and use this to
// also resync on those failures, when the tab becomes visible again, and
// (optionally) on a slow poll.

const ERROR_STATUSES = ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']
// supabase-js re-joins a failed channel on a backoff and reports the error each
// time; resyncing once per window is enough.
const ERROR_RESYNC_MIN_GAP_MS = 30000

/**
 * Subscribes `channel` and calls `resync` (use the page's debounced loader) when
 * it re-subscribes or errors. Options:
 *   pollMs     slow fallback poll, skipped while the tab is hidden
 *   onVisible  also resync when the tab becomes visible again
 * Returns the cleanup function (removes the channel and every listener/timer).
 */
export function subscribeResync(channel, resync, { pollMs = 0, onVisible = false } = {}) {
  let disposed = false
  let subscribedBefore = false
  let lastErrorResync = 0

  channel.subscribe(status => {
    if (disposed) return // removeChannel() reports CLOSED during cleanup
    if (status === 'SUBSCRIBED') {
      // The first SUBSCRIBED is covered by the page's initial load.
      if (subscribedBefore) resync()
      subscribedBefore = true
    } else if (ERROR_STATUSES.includes(status)) {
      const now = Date.now()
      if (now - lastErrorResync >= ERROR_RESYNC_MIN_GAP_MS) {
        lastErrorResync = now
        resync()
      }
    }
  })

  const visible = () => document.visibilityState === 'visible'
  const timer = pollMs ? setInterval(() => { if (visible()) resync() }, pollMs) : null
  const handleVisibility = () => { if (visible()) resync() }
  if (onVisible) document.addEventListener('visibilitychange', handleVisibility)

  return () => {
    disposed = true
    if (timer) clearInterval(timer)
    if (onVisible) document.removeEventListener('visibilitychange', handleVisibility)
    supabase.removeChannel(channel)
  }
}
