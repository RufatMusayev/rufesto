// The bell badge (top bar on a phone, sidebar on desktop) and the live feed behind it.
//
// One module-level store, one realtime channel. `useNotificationBadge()` is mounted ONCE, by AppLayout, and returns the
// number; the Notifications page uses setInboxOpen() / onInboxInsert() so the bell and the list stay in step:
//  - the number is notifications_badge().guest_unseen (rows nobody has looked at yet); before sql/64 it is the number of
//    unread guest rows, as it always was;
//  - an INSERT / UPDATE on the guest's own rows re-reads it, debounced (a burst of likes is one read);
//  - while the inbox page is open the number stays 0 (everything new is on screen) and opening it marks the rows seen.
import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { fetchBadge, markAllSeen, badgeIsSeenBased } from './api'

let count = 0
let inboxOpen = false
let seq = 0
let timer = null
const listeners = new Set()
const insertListeners = new Set()

function set(n) {
  if (n === count) return
  count = n
  listeners.forEach(l => l())
}

const subscribe = l => { listeners.add(l); return () => listeners.delete(l) }
const snapshot = () => count

/** Re-read the number now (a read that was overtaken by a newer one is dropped). */
export async function refreshBadge() {
  const mine = ++seq
  if (inboxOpen && badgeIsSeenBased()) { set(0); return }
  const n = await fetchBadge()
  if (mine !== seq || n == null) return
  set(inboxOpen && badgeIsSeenBased() ? 0 : n)
}

function scheduleRefresh(ms = 300) {
  clearTimeout(timer)
  timer = setTimeout(refreshBadge, ms)
}

/** Called by the inbox page: true on mount (clears the badge, marks the rows seen), false on unmount. */
export function setInboxOpen(open) {
  inboxOpen = open
  if (!open) return
  if (badgeIsSeenBased()) set(0)
  markAllSeen().then(() => scheduleRefresh(0))
}

/** Listener for rows the realtime channel just delivered (guest audience only): (row) => void. Returns the unsubscribe. */
export function onInboxInsert(listener) {
  insertListeners.add(listener)
  return () => insertListeners.delete(listener)
}

/** Mount once (AppLayout). Returns the number for the bell. */
export function useNotificationBadge() {
  const { session } = useAuth()
  const uid = session?.user?.id

  useEffect(() => {
    if (!uid) { seq += 1; set(0); return undefined }
    refreshBadge()

    const channel = supabase
      .channel('notif-badge')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}`,
      }, payload => {
        if (payload.eventType === 'INSERT' && payload.new?.audience !== 'staff') insertListeners.forEach(l => l(payload.new))
        scheduleRefresh()
      })
      .subscribe()

    // a phone that slept missed events: look again when the app comes back
    const wake = () => { if (document.visibilityState === 'visible') scheduleRefresh(100) }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('focus', wake)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('focus', wake)
      supabase.removeChannel(channel)
    }
  }, [uid])

  return useSyncExternalStore(subscribe, snapshot, () => 0)
}
