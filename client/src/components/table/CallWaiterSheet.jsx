import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import useEscapeClose from '../ui/useEscapeClose'

const COOLDOWN_MS = 2 * 60 * 1000

const KINDS = [
  { id: 'assist',  icon: '🙋', labelKey: 'waiterAssist' },
  { id: 'water',   icon: '💧', labelKey: 'waiterWater' },
  { id: 'cutlery', icon: '🍴', labelKey: 'waiterCutlery' },
  { id: 'clean',   icon: '🧹', labelKey: 'waiterClean' },
]

// Trigger button + sheet for calling a waiter (call_waiter RPC). Tracks the caller's
// own most recent open/acknowledged service_requests row live via realtime (RLS
// scopes rows to the caller), and enforces the server's 2-min-per-guest cooldown
// locally too so the button reflects it immediately after a successful call.
export default function CallWaiterSheet({ tableId }) {
  const { t } = useTranslation(['table', 'common'])
  const [open, setOpen] = useState(false)
  useEscapeClose(() => setOpen(false), open)
  const [calling, setCalling] = useState(false)
  const [error, setError] = useState('')
  const [activeRequest, setActiveRequest] = useState(null)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!tableId) return
    let cancelled = false
    supabase
      .from('service_requests')
      .select('id, kind, status, created_at, acknowledged_at, resolved_at')
      .eq('table_id', tableId)
      .in('status', ['open', 'acknowledged'])
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (!err && data && data.length) setActiveRequest(data[0])
      })
    return () => { cancelled = true }
  }, [tableId])

  useEffect(() => {
    if (!tableId) return
    const channel = supabase
      .channel(`service-requests-${tableId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'service_requests',
        filter: `table_id=eq.${tableId}`,
      }, (payload) => {
        const row = payload.new
        if (!row) return
        if (row.status === 'done' || row.status === 'cancelled') {
          setActiveRequest(prev => (prev && prev.id === row.id) ? null : prev)
        } else {
          setActiveRequest(row)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [tableId])

  useEffect(() => {
    if (!cooldownUntil) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [cooldownUntil])

  const cooldownRemaining = Math.max(0, Math.ceil((cooldownUntil - now) / 1000))
  const onCooldown = cooldownRemaining > 0

  async function handleCall(kind) {
    setCalling(true)
    setError('')
    const { data, error: err } = await supabase.rpc('call_waiter', { p_table_id: tableId, p_kind: kind })
    setCalling(false)
    if (err) {
      const msg = err.message || ''
      if (msg.includes('too_soon')) setError(t('table:waiterTooSoon'))
      else if (msg.includes('too_many_open')) setError(t('table:waiterTooMany'))
      else if (msg.includes('no_session')) setError(t('table:waiterNoSession'))
      else if (msg.includes('invalid_kind')) setError(t('table:waiterInvalidKind'))
      else setError(t('table:waiterFailed'))
      return
    }
    setActiveRequest({ id: data.id, kind, status: 'open', created_at: data.created_at })
    setCooldownUntil(Date.now() + COOLDOWN_MS)
    setNow(Date.now())
    setOpen(false)
  }

  const buttonLabel = activeRequest
    ? (activeRequest.status === 'acknowledged' ? t('table:waiterOnTheWay') : t('table:waiterCalled'))
    : onCooldown
      ? t('table:waiterCooldown', { seconds: cooldownRemaining })
      : t('table:callWaiter')

  return (
    <>
      <button
        className="btn btn-ghost table-call-btn"
        onClick={() => { setError(''); setOpen(true) }}
        disabled={onCooldown}
      >
        <span>🔔</span>
        {buttonLabel}
      </button>

      {open && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="sheet">
            <div className="sheet-handle" />
            <div style={{ padding: '1rem 1.25rem 2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.1rem', fontWeight: 700, color: 'var(--t1)' }}>
                  {t('table:callWaiterTitle')}
                </h2>
                <button onClick={() => setOpen(false)} className="icon-btn" aria-label={t('common:close')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {error && (
                <p style={{ color: 'var(--red)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{error}</p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {KINDS.map(k => (
                  <button
                    key={k.id}
                    onClick={() => handleCall(k.id)}
                    disabled={calling}
                    style={{
                      width: '100%', padding: '13px 16px', borderRadius: 12,
                      border: '1.5px solid var(--border)', background: 'var(--s2)',
                      display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                      textAlign: 'left', opacity: calling ? 0.6 : 1,
                    }}
                  >
                    <span style={{ fontSize: '1.2rem' }}>{k.icon}</span>
                    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--t1)' }}>
                      {t(`table:${k.labelKey}`)}
                    </span>
                  </button>
                ))}
              </div>

              <button className="btn btn-ghost" style={{ width: '100%', marginTop: 12 }} onClick={() => setOpen(false)}>
                {t('common:cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
