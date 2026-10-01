import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// The realtime channel below only sees this guest's own session row (RLS), so other guests
// joining or leaving only show up through this poll (join requests also arrive via notifications).
const POLL_MS = 10000

// Shown on /table for an active (approved) guest: who else is seated, and — for the
// host only — who's waiting to be let in, with Approve/Decline. Refreshes when a
// table_sessions row for this table changes (realtime), when a 'join_request'
// notification arrives, on window focus, and on a 10 s poll.
export default function TableParty({ tableId }) {
  const { t } = useTranslation(['table', 'common'])
  const { session } = useAuth()
  const [party, setParty] = useState(null)
  const [respondingId, setRespondingId] = useState(null)
  const [respondError, setRespondError] = useState('')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const load = useCallback(async () => {
    if (!tableId) return
    const { data, error } = await supabase.rpc('table_party', { p_table_id: tableId })
    if (!mountedRef.current) return
    if (!error && data) setParty(data)
  }, [tableId])

  useEffect(() => {
    if (!tableId) return
    load()
    const interval = setInterval(load, POLL_MS)
    function onFocus() { load() }
    window.addEventListener('focus', onFocus)

    const channel = supabase
      .channel(`table-party-sessions-${tableId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'table_sessions',
        filter: `table_id=eq.${tableId}`,
      }, () => load())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') load()   // catch up on anything missed before the channel came up
      })

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      supabase.removeChannel(channel)
    }
  }, [load, tableId])

  useEffect(() => {
    const uid = session?.user?.id
    if (!uid) return
    const channel = supabase
      .channel(`table-party-notif-${uid}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${uid}`,
      }, (payload) => {
        if (payload.new?.type === 'join_request') load()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session?.user?.id, load])

  async function respond(sessionId, approve) {
    setRespondingId(sessionId)
    setRespondError('')
    const { error } = await supabase.rpc('respond_join_request', { p_session_id: sessionId, p_approve: approve })
    if (!mountedRef.current) return
    setRespondingId(null)
    if (error) {
      setRespondError(t('table:waiterFailed'))
      return
    }
    load()
  }

  if (!party || party.status !== 'active') return null

  const members = party.members || []
  const activeMembers = members.filter(m => m.status === 'active')
  const pendingMembers = members.filter(m => m.status === 'pending')

  // Nothing worth a panel for a lone active guest with no one waiting.
  if (activeMembers.length <= 1 && pendingMembers.length === 0) return null

  return (
    <div style={{
      background: 'var(--s2)', borderRadius: 12, border: '1px solid var(--border)',
      padding: '14px 16px', marginBottom: 16,
    }}>
      <div style={{
        fontSize: '0.68rem', fontWeight: 700, color: 'var(--t3)',
        textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
      }}>
        {t('table:partyTitle')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: pendingMembers.length ? 12 : 0 }}>
        {activeMembers.map(m => (
          <div key={m.session_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 26, height: 26, borderRadius: '50%', background: 'var(--s3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.7rem', fontWeight: 700, color: 'var(--t2)', flexShrink: 0,
            }}>
              {(m.name || '?').charAt(0).toUpperCase()}
            </span>
            <span style={{ fontSize: '0.84rem', color: 'var(--t1)', fontWeight: 500 }}>
              {m.name}
              {m.is_me && <span style={{ color: 'var(--t3)', fontWeight: 400 }}> ({t('common:you')})</span>}
            </span>
            {m.is_host && (
              <span style={{
                fontSize: '0.6rem', fontWeight: 700, color: 'var(--gold)',
                background: 'rgba(196,154,44,0.12)', border: '1px solid rgba(196,154,44,0.25)',
                borderRadius: 100, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                {t('table:hostBadge')}
              </span>
            )}
          </div>
        ))}
      </div>

      {party.is_host && pendingMembers.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>
            {t('table:pendingRequests')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingMembers.map(m => (
              <div key={m.session_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.84rem', color: 'var(--t1)', flex: 1 }}>{m.name}</span>
                <button
                  onClick={() => respond(m.session_id, true)}
                  disabled={respondingId === m.session_id}
                  className="btn btn-primary"
                  style={{ fontSize: '0.72rem', padding: '5px 12px' }}
                >
                  {t('table:approve')}
                </button>
                <button
                  onClick={() => respond(m.session_id, false)}
                  disabled={respondingId === m.session_id}
                  className="btn btn-danger"
                  style={{ fontSize: '0.72rem', padding: '5px 12px' }}
                >
                  {t('table:decline')}
                </button>
              </div>
            ))}
          </div>
          {respondError && (
            <p style={{ color: 'var(--red)', fontSize: '0.74rem', marginTop: 8 }}>{respondError}</p>
          )}
        </div>
      )}

      {party.is_host && (
        <p style={{ fontSize: '0.7rem', color: 'var(--t4)', marginTop: 10, lineHeight: 1.5 }}>
          {t('table:inviteHint')}
        </p>
      )}
    </div>
  )
}
