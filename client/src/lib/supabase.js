import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Writes that change what Home, Friends and Discover show (a follow or unfollow, a friend request sent,
// answered, cancelled or removed) announce themselves on `window`, so the in-memory tab stores can mark
// themselves stale (features/feed/feeds.js listens). One choke point here covers every screen that makes
// these writes, whoever owns that screen, so a new "Follow" button cannot forget to invalidate.
export const SOCIAL_WRITE_EVENT = 'rufesto:social-write'
const FOLLOW_WRITE = /\/rest\/v1\/user_follows(\?|$)/
const FRIEND_WRITE = /\/rest\/v1\/rpc\/(send_friend_request|respond_friend_request|cancel_friend_request|remove_friend)(\?|$)/

async function watchedFetch(input, init) {
  const res = await fetch(input, init)
  const method = String(init?.method || input?.method || 'GET').toUpperCase()
  if (method === 'HEAD') {
    // The count queries (head: true: notifications badge, profile counts, friends...) are HEAD requests, and postgrest-js
    // never reads the body of a HEAD response. The browser then cancels the unread response and the network log shows
    // net::ERR_ABORTED on every page. Read it (it is empty) and hand back the same status and headers without a body.
    try { await res.arrayBuffer() } catch { /* nothing to read */ }
    return new Response(null, { status: res.status, statusText: res.statusText, headers: res.headers })
  }
  try {
    if (res.ok && method !== 'GET') {
      const url = typeof input === 'string' ? input : (input?.url || String(input))
      const kind = FOLLOW_WRITE.test(url) ? 'follow' : FRIEND_WRITE.test(url) ? 'friend' : null
      if (kind) window.dispatchEvent(new CustomEvent(SOCIAL_WRITE_EVENT, { detail: kind }))
    }
  } catch { /* announcing is best effort, never part of the request */ }
  return res
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: watchedFetch } })
