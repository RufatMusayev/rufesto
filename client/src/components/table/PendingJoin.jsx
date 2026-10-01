import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCart } from '../../contexts/CartContext'

// Only used while the realtime channel is not SUBSCRIBED (see the table_sessions effect below).
const FALLBACK_POLL_MS = 30000

// Shown on /table while the guest is seated but not yet approved by the host
// (claim_table returned session_status:'pending'). Re-checks table_party() whenever this
// guest's own table_sessions row changes (realtime), and also listens for the host's
// decision via notifications (join_approved / join_declined). A slow poll only runs while
// the realtime channel is down.
export default function PendingJoin({ tableId }) {
  const { t } = useTranslation(['table', 'booking', 'common'])
  const { session } = useAuth()
  const { clearTable, refreshTableSession } = useCart()
  const [hostName, setHostName] = useState('')
  const [declined, setDeclined] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    return () => { cancelledRef.current = true }
  }, [])

  // table_party() stays the source of truth (status flips to 'active' once the host approves,
  // or the RPC errors 'no_session' once they decline / the guest is removed). Realtime on
  // table_sessions just tells us *when* to ask. RLS only exposes this guest's own session row
  // to the channel, which is exactly the row whose change matters here.
  useEffect(() => {
    if (!tableId) return
    let stopped = false
    let finished = false
    let subscribed = false
    let timer = null

    function stopFallback() {
      if (timer) { clearTimeout(timer); timer = null }
    }

    async function check() {
      if (stopped || finished) return
      const { data, error } = await supabase.rpc('table_party', { p_table_id: tableId })
      if (stopped || finished || cancelledRef.current) return

      if (error) {
        if ((error.message || '').includes('no_session')) {
          finished = true
          stopFallback()
          setDeclined(true)
          setTimeout(() => { if (!stopped) clearTable(false) }, 2500)
        }
        return
      }

      if (data?.host_name) setHostName(data.host_name)
      if (data?.status === 'active') {
        finished = true
        stopFallback()
        await refreshTableSession()
      }
    }

    function scheduleFallback() {
      stopFallback()
      if (stopped || finished || subscribed) return
      timer = setTimeout(async () => {
        await check()
        scheduleFallback()
      }, FALLBACK_POLL_MS)
    }

    const channel = supabase
      .channel(`pending-session-${tableId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'table_sessions',
        filter: `table_id=eq.${tableId}`,
      }, () => { check() })
      .subscribe((status) => {
        subscribed = status === 'SUBSCRIBED'
        if (subscribed) {
          stopFallback()
          check()   // catch anything that changed before the channel came up
        } else {
          scheduleFallback()
        }
      })

    check()
    scheduleFallback()

    return () => {
      stopped = true
      stopFallback()
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId])

  // Realtime: the host's decision also lands as a notification for this guest —
  // react to it immediately instead of waiting for the next poll tick.
  useEffect(() => {
    const uid = session?.user?.id
    if (!uid) return
    const channel = supabase
      .channel(`pending-join-${uid}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${uid}`,
      }, (payload) => {
        if (cancelledRef.current) return
        const row = payload.new
        if (!row) return
        if (row.type === 'join_approved') {
          refreshTableSession()
        } else if (row.type === 'join_declined') {
          setDeclined(true)
          setTimeout(() => { if (!cancelledRef.current) clearTable(false) }, 2500)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

  async function handleCancel() {
    setCanceling(true)
    await clearTable(true)
    if (!cancelledRef.current) setCanceling(false)
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '75vh', padding: '2rem',
      maxWidth: 400, margin: '0 auto', textAlign: 'center',
    }}>
      <div style={{
        width: 88, height: 88, borderRadius: '50%',
        background: declined ? 'rgba(163,45,45,0.10)' : 'rgba(196,154,44,0.12)',
        border: `1px solid ${declined ? 'var(--red)' : 'var(--gold)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
      }}>
        {declined ? (
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <span className="table-pulse" style={{
            width: 14, height: 14, borderRadius: '50%', background: 'var(--gold)',
          }} />
        )}
      </div>

      {declined ? (
        <>
          <h2 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: '1.25rem', fontWeight: 700, marginBottom: 8, color: 'var(--t1)',
          }}>
            {t('table:joinDeclinedTitle')}
          </h2>
          <p style={{ fontSize: '0.86rem', color: 'var(--t3)', lineHeight: 1.6 }}>
            {t('table:joinDeclinedMessage')}
          </p>
        </>
      ) : (
        <>
          <h2 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: '1.25rem', fontWeight: 700, marginBottom: 8, color: 'var(--t1)',
          }}>
            {t('table:waitingForHost', { name: hostName || t('table:theHost') })}
          </h2>
          <p style={{ fontSize: '0.86rem', color: 'var(--t3)', lineHeight: 1.6, marginBottom: 28 }}>
            {t('table:waitingForHostHint')}
          </p>
          <button
            onClick={handleCancel}
            disabled={canceling}
            className="btn btn-ghost"
            style={{ padding: '10px 28px' }}
          >
            {canceling
              ? <><span className="spinner" style={{ width: 14, height: 14 }} /> {t('table:checking')}</>
              : t('table:cancelJoin')}
          </button>
        </>
      )}
    </div>
  )
}
