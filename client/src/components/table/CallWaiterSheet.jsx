import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import BottomSheet from '../ui/BottomSheet'
import './callWaiter.css'

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

      <BottomSheet id="waiter" open={open} onClose={() => setOpen(false)} title={t('table:callWaiterTitle')}>
        {error && <p className="cw-error" role="alert">{error}</p>}

        <div className="cw-kinds">
          {KINDS.map(k => (
            <button type="button" key={k.id} className="cw-kind row-pressable" onClick={() => handleCall(k.id)} disabled={calling}>
              <span className="cw-kind-icon" aria-hidden="true">{k.icon}</span>
              <span className="cw-kind-label">{t(`table:${k.labelKey}`)}</span>
            </button>
          ))}
        </div>

        <button type="button" className="btn btn-ghost cw-cancel" onClick={() => setOpen(false)}>{t('common:cancel')}</button>
      </BottomSheet>
    </>
  )
}
